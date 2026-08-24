import { prisma } from "../config/db";
import { AppointmentStatus } from "@prisma/client";
import { AppError, ConflictError, ForbiddenError, NotFoundError } from "../utils/errors";
import { isUniqueConstraintError } from "../utils/prismaErrors";
import { generateDaySlots, slotLockKey, startOfUtcDay, WorkingHours } from "../utils/slots";
import { generatePostVisitSummary, generatePreVisitSummary } from "./llmService";
import { emailTemplates, sendEmail } from "./emailService";
import { createCalendarEvent, deleteCalendarEvent, updateCalendarEvent } from "./calendarService";
import { buildIcsContent, googleCalendarUrl as buildGoogleCalendarUrl } from "../utils/ics";
import { env } from "../config/env";

const HOLD_MS = env.slotHoldMinutes * 60 * 1000;

/** Returns bookable slot start times for a doctor on a given date, excluding
 *  already-taken slots, past slots, and leave days. */
export async function getAvailableSlots(doctorId: string, dateStr: string): Promise<string[]> {
  const doctor = await prisma.doctorProfile.findUnique({ where: { id: doctorId } });
  if (!doctor) throw new NotFoundError("Doctor not found");

  const dateOnly = startOfUtcDay(new Date(dateStr));

  const leave = await prisma.doctorLeave.findUnique({
    where: { doctorId_date: { doctorId, date: dateOnly } },
  });
  if (leave) return [];

  const workingHours = JSON.parse(doctor.workingHoursJson) as WorkingHours;
  const candidateSlots = generateDaySlots(dateOnly, workingHours, doctor.slotDurationMinutes);

  const dayEnd = new Date(dateOnly.getTime() + 24 * 60 * 60 * 1000);
  const taken = await prisma.appointment.findMany({
    where: {
      doctorId,
      slotStart: { gte: dateOnly, lt: dayEnd },
      status: { in: [AppointmentStatus.HOLD, AppointmentStatus.CONFIRMED] },
    },
    select: { slotStart: true },
  });
  const takenTimes = new Set(taken.map((t: (typeof taken)[number]) => t.slotStart.toISOString()));

  const now = new Date();
  return candidateSlots.filter((s) => s > now && !takenTimes.has(s.toISOString())).map((s) => s.toISOString());
}

interface BookInput {
  patientId: string;
  doctorId: string;
  slotStartIso: string;
  symptomsText: string;
  patientMobile?: string | null;
}

/**
 * Books an appointment. Double-booking safety: the DB-unique `slotLockKey`
 * is what actually decides the race, not this application-level check —
 * two simultaneous requests for the same slot will both pass the
 * pre-check, but only one INSERT can win the unique constraint, and we
 * translate that failure into a clean 409 for the loser.
 */
export async function bookAppointment(input: BookInput) {
  const doctor = await prisma.doctorProfile.findUnique({ where: { id: input.doctorId } });
  if (!doctor) throw new NotFoundError("Doctor not found");

  const slotStart = new Date(input.slotStartIso);
  if (Number.isNaN(slotStart.getTime()) || slotStart < new Date()) {
    throw new AppError("Slot must be a valid, future date/time", 422);
  }
  const slotEnd = new Date(slotStart.getTime() + doctor.slotDurationMinutes * 60000);

  const dateOnly = startOfUtcDay(slotStart);
  const onLeave = await prisma.doctorLeave.findUnique({ where: { doctorId_date: { doctorId: input.doctorId, date: dateOnly } } });
  if (onLeave) throw new ConflictError("The doctor is on leave that day. Please choose another date.");

  // Token/queue number: the patient's position in that doctor's queue for the day,
  // assigned as (count of active bookings that day) + 1. Not wrapped in the same
  // transaction as the slot-lock insert, so under a rare simultaneous-booking race
  // two different patients could receive the same token — a display glitch, not a
  // safety issue (unlike double-booking, which is guaranteed safe by slotLockKey).
  const dayEnd = new Date(dateOnly.getTime() + 24 * 60 * 60 * 1000);
  const tokenNumber =
    (await prisma.appointment.count({
      where: { doctorId: input.doctorId, slotStart: { gte: dateOnly, lt: dayEnd }, status: { in: ["HOLD", "CONFIRMED", "IN_PROGRESS", "COMPLETED"] } },
    })) + 1;

  let appointment;
  try {
    appointment = await prisma.appointment.create({
      data: {
        patientId: input.patientId,
        doctorId: input.doctorId,
        slotStart,
        slotEnd,
        status: AppointmentStatus.HOLD,
        slotLockKey: slotLockKey(input.doctorId, slotStart),
        holdExpiresAt: new Date(Date.now() + HOLD_MS),
        symptomsText: input.symptomsText,
        patientMobile: input.patientMobile,
        tokenNumber,
        tokenDate: dateOnly,
      },
    });
  } catch (err) {
    if (isUniqueConstraintError(err)) {
      throw new ConflictError("This slot was just taken by another patient. Please pick a different time.");
    }
    throw err;
  }

  // Generate the pre-visit LLM summary. Failures are handled inside
  // generatePreVisitSummary itself (never throws) so booking always completes.
  const llmResult = await generatePreVisitSummary(input.symptomsText);

  appointment = await prisma.appointment.update({
    where: { id: appointment.id },
    data: {
      status: AppointmentStatus.CONFIRMED,
      preVisitSummaryJson: JSON.stringify(llmResult.data),
      preVisitLlmFailed: !llmResult.ok,
      holdExpiresAt: null,
    },
    include: {
      patient: { include: { user: true } },
      doctor: { include: { user: true } },
    },
  });

  const whenLabel = slotStart.toLocaleString("en-US", { dateStyle: "full", timeStyle: "short", timeZone: "UTC" }) + " UTC";

  const calendarEvent = {
    title: `Appointment with Dr. ${appointment.doctor.user.name}`,
    description: `ClinicAssist appointment${appointment.tokenNumber ? ` (token #${appointment.tokenNumber})` : ""} with Dr. ${appointment.doctor.user.name}, ${appointment.doctor.specialization}.`,
    startIso: slotStart.toISOString(),
    endIso: slotEnd.toISOString(),
    uid: appointment.id,
  };

  await sendEmail({
    to: appointment.patient.user.email,
    subject: "Your ClinicAssist appointment is confirmed",
    html: emailTemplates.bookingConfirmationPatient({
      patientName: appointment.patient.user.name,
      doctorName: appointment.doctor.user.name,
      specialization: appointment.doctor.specialization,
      when: whenLabel,
      tokenNumber: appointment.tokenNumber ?? undefined,
      googleCalendarUrl: buildGoogleCalendarUrl(calendarEvent),
    }),
    type: "BOOKING_CONFIRMATION",
    appointmentId: appointment.id,
    attachments: [{ filename: "appointment.ics", content: buildIcsContent(calendarEvent), contentType: "text/calendar" }],
  });
  await sendEmail({
    to: appointment.doctor.user.email,
    subject: "New appointment booked",
    html: emailTemplates.bookingNotificationDoctor(appointment.doctor.user.name, appointment.patient.user.name, whenLabel),
    type: "DOCTOR_NEW_BOOKING",
    appointmentId: appointment.id,
  });

  // Calendar sync is opportunistic: only runs if the user connected Google.
  const [patientCred, doctorCred] = await Promise.all([
    prisma.googleCredential.findUnique({ where: { userId: appointment.patient.userId } }),
    prisma.googleCredential.findUnique({ where: { userId: appointment.doctor.userId } }),
  ]);

  let googleEventIdPatient: string | null = null;
  let googleEventIdDoctor: string | null = null;

  if (patientCred) {
    googleEventIdPatient = await createCalendarEvent({
      refreshToken: patientCred.refreshToken,
      summary: `Appointment with Dr. ${appointment.doctor.user.name}`,
      description: "Booked via ClinicAssist.",
      startIso: slotStart.toISOString(),
      endIso: slotEnd.toISOString(),
    });
  }
  if (doctorCred) {
    googleEventIdDoctor = await createCalendarEvent({
      refreshToken: doctorCred.refreshToken,
      summary: `Appointment with ${appointment.patient.user.name}`,
      description: appointment.symptomsText ?? "",
      startIso: slotStart.toISOString(),
      endIso: slotEnd.toISOString(),
    });
  }

  if (googleEventIdPatient || googleEventIdDoctor) {
    appointment = await prisma.appointment.update({
      where: { id: appointment.id },
      data: { googleEventIdPatient, googleEventIdDoctor },
      include: { patient: { include: { user: true } }, doctor: { include: { user: true } } },
    });
  }

  return appointment;
}

interface CancelInput {  appointmentId: string;
  actingUserId: string;
  actingRole: string;
  reason?: string | null;
  customReason?: string | null;
}

export async function cancelAppointment(input: CancelInput) {
  const appt = await prisma.appointment.findUnique({
    where: { id: input.appointmentId },
    include: { patient: true, doctor: true },
  });
  if (!appt) throw new NotFoundError("Appointment not found");

  const isOwnerPatient = input.actingRole === "PATIENT" && appt.patient.userId === input.actingUserId;
  const isOwnerDoctor = input.actingRole === "DOCTOR" && appt.doctor.userId === input.actingUserId;
  if (!isOwnerPatient && !isOwnerDoctor && input.actingRole !== "ADMIN") {
    throw new ForbiddenError("You can only cancel your own appointments");
  }

  const cancellationReason = input.reason === "Other" ? input.customReason ?? "Other" : input.reason ?? undefined;

  const updated = await prisma.appointment.update({
    where: { id: input.appointmentId },
    data: { status: AppointmentStatus.CANCELLED, slotLockKey: null, cancellationReason },
    include: { patient: { include: { user: true } }, doctor: { include: { user: true } } },
  });

  const [patientCred, doctorCred] = await Promise.all([
    prisma.googleCredential.findUnique({ where: { userId: updated.patient.userId } }),
    prisma.googleCredential.findUnique({ where: { userId: updated.doctor.userId } }),
  ]);
  if (patientCred && updated.googleEventIdPatient) await deleteCalendarEvent(patientCred.refreshToken, updated.googleEventIdPatient);
  if (doctorCred && updated.googleEventIdDoctor) await deleteCalendarEvent(doctorCred.refreshToken, updated.googleEventIdDoctor);

  const whenLabel = updated.slotStart.toLocaleString("en-US", { dateStyle: "full", timeStyle: "short", timeZone: "UTC" }) + " UTC";
  await sendEmail({
    to: updated.patient.user.email,
    subject: "Your appointment has been cancelled",
    html: emailTemplates.cancellation(updated.patient.user.name, whenLabel, updated.doctor.user.name),
    type: "CANCELLATION",
    appointmentId: updated.id,
  });

  return updated;
}

interface RescheduleInput {
  appointmentId: string;
  actingUserId: string;
  actingRole: string;
  newSlotStartIso: string;
}

/** Moves an appointment to a new slot instead of forcing cancel + rebook. Reuses the same
 *  double-booking protection as a fresh booking (unique slotLockKey), recomputes the token
 *  for the new day, and notifies the patient with the new date/time/token. Available to the
 *  patient themselves, the assigned doctor, or an admin. */
export async function rescheduleAppointment(input: RescheduleInput) {
  const appt = await prisma.appointment.findUnique({
    where: { id: input.appointmentId },
    include: { patient: { include: { user: true } }, doctor: { include: { user: true } } },
  });
  if (!appt) throw new NotFoundError("Appointment not found");

  const isOwnerPatient = input.actingRole === "PATIENT" && appt.patient.userId === input.actingUserId;
  const isOwnerDoctor = input.actingRole === "DOCTOR" && appt.doctor.userId === input.actingUserId;
  if (!isOwnerPatient && !isOwnerDoctor && input.actingRole !== "ADMIN") {
    throw new ForbiddenError("You can only reschedule your own appointments");
  }
  if (appt.status === "CANCELLED" || appt.status === "COMPLETED") {
    throw new ConflictError(`Cannot reschedule an appointment that is already ${appt.status.toLowerCase()}`);
  }

  const newSlotStart = new Date(input.newSlotStartIso);
  if (Number.isNaN(newSlotStart.getTime()) || newSlotStart < new Date()) {
    throw new AppError("The new slot must be a valid, future date/time", 422);
  }
  const newSlotEnd = new Date(newSlotStart.getTime() + appt.doctor.slotDurationMinutes * 60000);

  const dateOnly = startOfUtcDay(newSlotStart);
  const onLeave = await prisma.doctorLeave.findUnique({ where: { doctorId_date: { doctorId: appt.doctorId, date: dateOnly } } });
  if (onLeave) throw new ConflictError("The doctor is on leave that day. Please choose another date.");

  const dayEnd = new Date(dateOnly.getTime() + 24 * 60 * 60 * 1000);
  const tokenNumber =
    (await prisma.appointment.count({
      where: {
        doctorId: appt.doctorId,
        slotStart: { gte: dateOnly, lt: dayEnd },
        status: { in: ["HOLD", "CONFIRMED", "IN_PROGRESS", "COMPLETED"] },
        id: { not: appt.id },
      },
    })) + 1;

  let updated;
  try {
    updated = await prisma.appointment.update({
      where: { id: appt.id },
      data: {
        slotStart: newSlotStart,
        slotEnd: newSlotEnd,
        slotLockKey: slotLockKey(appt.doctorId, newSlotStart),
        status: AppointmentStatus.CONFIRMED,
        tokenNumber,
        tokenDate: dateOnly,
      },
      include: { patient: { include: { user: true } }, doctor: { include: { user: true } } },
    });
  } catch (err) {
    if (isUniqueConstraintError(err)) {
      throw new ConflictError("That slot was just taken. Please pick a different time.");
    }
    throw err;
  }

  const whenLabel = newSlotStart.toLocaleString("en-US", { dateStyle: "full", timeStyle: "short", timeZone: "UTC" }) + " UTC";
  const rescheduledEvent = {
    title: `Appointment with Dr. ${updated.doctor.user.name}`,
    description: `ClinicAssist appointment${updated.tokenNumber ? ` (token #${updated.tokenNumber})` : ""} with Dr. ${updated.doctor.user.name}.`,
    startIso: newSlotStart.toISOString(),
    endIso: newSlotEnd.toISOString(),
    uid: updated.id,
  };
  await sendEmail({
    to: updated.patient.user.email,
    subject: "Your appointment has been rescheduled",
    html: emailTemplates.rescheduled(
      updated.patient.user.name,
      updated.doctor.user.name,
      whenLabel,
      updated.tokenNumber ?? undefined,
      buildGoogleCalendarUrl(rescheduledEvent)
    ),
    type: "BOOKING_CONFIRMATION",
    appointmentId: updated.id,
    attachments: [{ filename: "appointment.ics", content: buildIcsContent(rescheduledEvent), contentType: "text/calendar" }],
  });

  const [patientCred, doctorCred] = await Promise.all([
    prisma.googleCredential.findUnique({ where: { userId: updated.patient.userId } }),
    prisma.googleCredential.findUnique({ where: { userId: updated.doctor.userId } }),
  ]);
  if (patientCred && updated.googleEventIdPatient) {
    await updateCalendarEvent(patientCred.refreshToken, updated.googleEventIdPatient, {
      startIso: newSlotStart.toISOString(),
      endIso: newSlotEnd.toISOString(),
    });
  }
  if (doctorCred && updated.googleEventIdDoctor) {
    await updateCalendarEvent(doctorCred.refreshToken, updated.googleEventIdDoctor, {
      startIso: newSlotStart.toISOString(),
      endIso: newSlotEnd.toISOString(),
    });
  }

  return updated;
}

/** A patient's past completed visits (across all doctors in the clinic) — the basic EMR
 *  history view a doctor sees alongside the current appointment. Excludes the appointment
 *  currently being viewed. */
export async function getPatientHistory(patientId: string, excludeAppointmentId?: string) {
  return prisma.appointment.findMany({
    where: { patientId, status: "COMPLETED", ...(excludeAppointmentId ? { id: { not: excludeAppointmentId } } : {}) },
    include: { doctor: { include: { user: { select: { name: true } } } } },
    orderBy: { slotStart: "desc" },
    take: 25,
  });
}


export async function startConsultation(appointmentId: string, doctorUserId: string) {
  const appt = await prisma.appointment.findUnique({ where: { id: appointmentId }, include: { doctor: true } });
  if (!appt) throw new NotFoundError("Appointment not found");
  if (appt.doctor.userId !== doctorUserId) throw new ForbiddenError("You can only manage your own appointments");
  return prisma.appointment.update({ where: { id: appointmentId }, data: { status: AppointmentStatus.IN_PROGRESS } });
}

/** Doctor marks a patient who didn't show up — frees their place in the queue. */
export async function markNoShow(appointmentId: string, doctorUserId: string) {
  const appt = await prisma.appointment.findUnique({ where: { id: appointmentId }, include: { doctor: true } });
  if (!appt) throw new NotFoundError("Appointment not found");
  if (appt.doctor.userId !== doctorUserId) throw new ForbiddenError("You can only manage your own appointments");
  return prisma.appointment.update({ where: { id: appointmentId }, data: { status: AppointmentStatus.NO_SHOW, slotLockKey: null } });
}

/** Today's queue for a doctor, sorted by token number — used for the "Now Serving" panel. */
export async function getTodayQueue(doctorId: string) {
  const dateOnly = startOfUtcDay(new Date());
  const dayEnd = new Date(dateOnly.getTime() + 24 * 60 * 60 * 1000);
  return prisma.appointment.findMany({
    where: {
      doctorId,
      slotStart: { gte: dateOnly, lt: dayEnd },
      status: { in: ["CONFIRMED", "IN_PROGRESS", "COMPLETED", "NO_SHOW"] },
    },
    include: { patient: { include: { user: true } } },
    orderBy: { tokenNumber: "asc" },
  });
}

/** Queue status for a single appointment — what a patient sees ("Your token, now serving, patients ahead"). */
export async function getQueueStatus(appointmentId: string) {
  const appt = await prisma.appointment.findUnique({ where: { id: appointmentId }, include: { doctor: true } });
  if (!appt) throw new NotFoundError("Appointment not found");
  if (!appt.tokenNumber || !appt.tokenDate) {
    return { tokenNumber: null, nowServing: null, patientsAhead: 0, estimatedWaitMinutes: 0 };
  }

  const dayEnd = new Date(appt.tokenDate.getTime() + 24 * 60 * 60 * 1000);
  const [inProgress, aheadCount] = await Promise.all([
    prisma.appointment.findFirst({
      where: { doctorId: appt.doctorId, slotStart: { gte: appt.tokenDate, lt: dayEnd }, status: "IN_PROGRESS" },
      select: { tokenNumber: true },
    }),
    prisma.appointment.count({
      where: {
        doctorId: appt.doctorId,
        slotStart: { gte: appt.tokenDate, lt: dayEnd },
        status: { in: ["CONFIRMED", "IN_PROGRESS"] },
        tokenNumber: { lt: appt.tokenNumber },
      },
    }),
  ]);

  return {
    tokenNumber: appt.tokenNumber,
    nowServing: inProgress?.tokenNumber ?? null,
    patientsAhead: aheadCount,
    estimatedWaitMinutes: aheadCount * appt.doctor.slotDurationMinutes,
  };
}

interface VisitNotesInput {
  appointmentId: string;
  doctorUserId: string;
  doctorNotes: string;
  prescription: Array<{
    medication: string;
    strength?: string | null;
    dosage: string;
    frequencyPerDay: number;
    durationDays: number;
    foodTiming?: string | null;
    instructions?: string | null;
  }>;
  followUpRecommended: boolean;
  followUpAfterDays?: number | null;
}

/** Doctor submits post-visit notes; generates the patient-friendly summary, schedules
 *  medication reminders, and emails the patient that their doctor has responded. */
export async function submitVisitNotes(input: VisitNotesInput) {
  const appt = await prisma.appointment.findUnique({
    where: { id: input.appointmentId },
    include: { doctor: { include: { user: true } }, patient: { include: { user: true } } },
  });
  if (!appt) throw new NotFoundError("Appointment not found");
  if (appt.doctor.userId !== input.doctorUserId) throw new ForbiddenError("You can only submit notes for your own appointments");

  const llmResult = await generatePostVisitSummary(input.doctorNotes, input.prescription);

  const updated = await prisma.appointment.update({
    where: { id: appt.id },
    data: {
      status: AppointmentStatus.COMPLETED,
      doctorNotes: input.doctorNotes,
      prescriptionJson: JSON.stringify(input.prescription),
      postVisitSummaryText: llmResult.data,
      postVisitLlmFailed: !llmResult.ok,
      followUpRecommended: input.followUpRecommended,
      followUpAfterDays: input.followUpRecommended ? input.followUpAfterDays : null,
      readByPatient: false,
    },
  });

  const startDate = new Date();
  for (const p of input.prescription) {
    const endDate = new Date(startDate.getTime() + p.durationDays * 24 * 60 * 60 * 1000);
    const times = defaultTimesForFrequency(p.frequencyPerDay);
    await prisma.medicationReminder.create({
      data: {
        appointmentId: appt.id,
        medicationName: p.medication,
        dosage: p.dosage,
        frequencyPerDay: p.frequencyPerDay,
        timesOfDayJson: JSON.stringify(times),
        startDate,
        endDate,
      },
    });
  }

  // Notify the patient — deliberately does NOT put medicine names/dosages in the email
  // body itself (sensitive medical info is better viewed in-app over an authenticated
  // session than sitting in an inbox); the email just points them to the app.
  await sendEmail({
    to: appt.patient.user.email,
    subject: "Your doctor has responded to your appointment",
    html: emailTemplates.visitCompleted(
      appt.patient.user.name,
      appt.doctor.user.name,
      input.prescription.length > 0,
      input.followUpRecommended ? input.followUpAfterDays ?? null : null
    ),
    type: "VISIT_COMPLETED",
    appointmentId: appt.id,
  });

  return updated;
}

/** The patient has opened this appointment and seen whatever changed — clears the
 *  "new update" dashboard badge for it. No-op (but safe) if it was already read. */
export async function markAppointmentReadByPatient(appointmentId: string, patientId: string) {
  const appt = await prisma.appointment.findUnique({ where: { id: appointmentId } });
  if (!appt) throw new NotFoundError("Appointment not found");
  if (appt.patientId !== patientId) throw new ForbiddenError("You don't have access to this appointment");
  if (appt.readByPatient) return appt;
  return prisma.appointment.update({ where: { id: appointmentId }, data: { readByPatient: true } });
}

function defaultTimesForFrequency(freq: number): string[] {
  const table: Record<number, string[]> = {
    1: ["09:00"],
    2: ["09:00", "21:00"],
    3: ["08:00", "14:00", "21:00"],
    4: ["08:00", "12:00", "17:00", "21:00"],
  };
  return table[freq] ?? ["09:00"];
}
