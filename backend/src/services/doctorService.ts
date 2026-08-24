import { prisma } from "../config/db";
import { AppointmentStatus } from "@prisma/client";
import { NotFoundError, ConflictError, AppError } from "../utils/errors";
import { startOfUtcDay, WorkingHours } from "../utils/slots";
import { emailTemplates, sendEmail } from "./emailService";
import { deleteCalendarEvent } from "./calendarService";

interface CreateDoctorInput {
  name: string;
  email: string;
  passwordHash: string;
  specialization: string;
  slotDurationMinutes: number;
  workingHours: WorkingHours;
  bio?: string | null;
}

export async function createDoctor(input: CreateDoctorInput) {
  const existing = await prisma.user.findUnique({ where: { email: input.email } });
  if (existing) throw new ConflictError("A user with this email already exists");

  return prisma.user.create({
    data: {
      name: input.name,
      email: input.email,
      passwordHash: input.passwordHash,
      role: "DOCTOR",
      // An admin creates this account directly and hands the doctor their
      // credentials out-of-band, so the email is already trusted — same
      // reasoning as Google sign-in. Skip the OTP-verification gate entirely;
      // otherwise the doctor is stuck on /verify-otp with no code ever sent.
      emailVerified: true,
      doctorProfile: {
        create: {
          specialization: input.specialization,
          slotDurationMinutes: input.slotDurationMinutes,
          workingHoursJson: JSON.stringify(input.workingHours),
          bio: input.bio,
        },
      },
    },
    include: { doctorProfile: true },
  });
}

export async function listDoctors(specialization?: string) {
  return prisma.doctorProfile.findMany({
    where: specialization ? { specialization: { contains: specialization } } : undefined,
    include: { user: { select: { id: true, name: true, email: true } } },
  });
}

export async function updateDoctorProfile(  doctorId: string,
  patch: Partial<{
    specialization: string;
    slotDurationMinutes: number;
    workingHours: WorkingHours;
    bio: string | null;
    qualifications: string | null;
    yearsOfExperience: number | null;
    consultationFee: string | null;
  }>
) {
  const doctor = await prisma.doctorProfile.findUnique({ where: { id: doctorId } });
  if (!doctor) throw new NotFoundError("Doctor not found");

  return prisma.doctorProfile.update({
    where: { id: doctorId },
    data: {
      specialization: patch.specialization,
      slotDurationMinutes: patch.slotDurationMinutes,
      workingHoursJson: patch.workingHours ? JSON.stringify(patch.workingHours) : undefined,
      bio: patch.bio,
      qualifications: patch.qualifications,
      yearsOfExperience: patch.yearsOfExperience,
      consultationFee: patch.consultationFee,
    },
  });
}

/**
 * Marks a doctor on leave for a date range (inclusive) — one row per day, since the
 * existing unique constraint on (doctorId, date) is already per-day. Any existing
 * HOLD/CONFIRMED appointments across the whole range are moved to RESCHEDULE_NEEDED
 * (freeing their slotLockKey) and the affected patients are emailed immediately, per
 * the "affected patients must be notified" requirement.
 */
export async function markDoctorLeave(doctorId: string, startDateStr: string, endDateStr: string, reason?: string | null) {
  const doctor = await prisma.doctorProfile.findUnique({ where: { id: doctorId }, include: { user: true } });
  if (!doctor) throw new NotFoundError("Doctor not found");

  const rangeStart = startOfUtcDay(new Date(startDateStr));
  const rangeEnd = startOfUtcDay(new Date(endDateStr));
  if (rangeEnd < rangeStart) throw new AppError("End date must be on or after the start date", 422);

  const dayCount = Math.round((rangeEnd.getTime() - rangeStart.getTime()) / (24 * 60 * 60 * 1000)) + 1;
  if (dayCount > 90) throw new AppError("Leave ranges longer than 90 days aren't supported in one request", 422);

  const leaves = [];
  let totalAffected = 0;

  for (let i = 0; i < dayCount; i++) {
    const dateOnly = new Date(rangeStart.getTime() + i * 24 * 60 * 60 * 1000);
    const dayEnd = new Date(dateOnly.getTime() + 24 * 60 * 60 * 1000);

    const leave = await prisma.doctorLeave.upsert({
      where: { doctorId_date: { doctorId, date: dateOnly } },
      update: { reason },
      create: { doctorId, date: dateOnly, reason },
    });
    leaves.push(leave);

    const affected = await prisma.appointment.findMany({
      where: {
        doctorId,
        slotStart: { gte: dateOnly, lt: dayEnd },
        status: { in: [AppointmentStatus.HOLD, AppointmentStatus.CONFIRMED] },
      },
      include: { patient: { include: { user: true } } },
    });

    for (const appt of affected) {
      await prisma.appointment.update({
        where: { id: appt.id },
        data: { status: AppointmentStatus.RESCHEDULE_NEEDED, slotLockKey: null, readByPatient: false },
      });

      const patientCred = await prisma.googleCredential.findUnique({ where: { userId: appt.patient.userId } });
      if (patientCred && appt.googleEventIdPatient) {
        await deleteCalendarEvent(patientCred.refreshToken, appt.googleEventIdPatient);
      }

      const whenLabel = dateOnly.toLocaleDateString("en-US", { dateStyle: "long", timeZone: "UTC" } as any);
      await sendEmail({
        to: appt.patient.user.email,
        subject: "Your doctor is unavailable — please rebook",
        html: emailTemplates.rescheduleNeeded(appt.patient.user.name, doctor.user.name, whenLabel),
        type: "RESCHEDULE_NEEDED",
        appointmentId: appt.id,
      });
    }
    totalAffected += affected.length;
  }

  return { leaves, affectedCount: totalAffected, dayCount };
}

export async function getDoctorByUserId(userId: string) {
  const doctor = await prisma.doctorProfile.findUnique({ where: { userId }, include: { user: true } });
  if (!doctor) throw new NotFoundError("Doctor profile not found");
  return doctor;
}

/** Deletes a doctor's User account, which cascades (via schema onDelete: Cascade) to their
 *  DoctorProfile, leave days, and appointments. This is a hard delete for this iteration —
 *  a production system handling real medical records would soft-delete/deactivate instead
 *  to preserve the audit trail, but that's out of scope for now (see README "Deferred"). */
export async function deleteDoctor(doctorId: string) {
  const doctor = await prisma.doctorProfile.findUnique({ where: { id: doctorId } });
  if (!doctor) throw new NotFoundError("Doctor not found");
  await prisma.user.delete({ where: { id: doctor.userId } });
}

export async function listDoctorLeaves(doctorId: string) {
  return prisma.doctorLeave.findMany({ where: { doctorId }, orderBy: { date: "asc" } });
}

// --- Leave requests: doctor asks, admin decides ---------------------------------------
// A doctor can no longer take themselves off the calendar directly. Requesting time off
// just files a PENDING row here; the actual DoctorLeave days (and the patient-notification
// side effects in markDoctorLeave) are only created once an admin approves it below.

function validatedLeaveRange(startDateStr: string, endDateStr: string) {
  const rangeStart = startOfUtcDay(new Date(startDateStr));
  const rangeEnd = startOfUtcDay(new Date(endDateStr));
  if (rangeEnd < rangeStart) throw new AppError("End date must be on or after the start date", 422);
  const dayCount = Math.round((rangeEnd.getTime() - rangeStart.getTime()) / (24 * 60 * 60 * 1000)) + 1;
  if (dayCount > 90) throw new AppError("Leave ranges longer than 90 days aren't supported in one request", 422);
  return { rangeStart, rangeEnd };
}

export async function requestLeave(doctorId: string, startDateStr: string, endDateStr: string, reason?: string | null) {
  const { rangeStart, rangeEnd } = validatedLeaveRange(startDateStr, endDateStr);
  return prisma.leaveRequest.create({
    data: { doctorId, startDate: rangeStart, endDate: rangeEnd, reason },
  });
}

export async function listLeaveRequestsForDoctor(doctorId: string) {
  return prisma.leaveRequest.findMany({ where: { doctorId }, orderBy: { createdAt: "desc" } });
}

export async function listAllLeaveRequests(status?: "PENDING" | "APPROVED" | "REJECTED") {
  return prisma.leaveRequest.findMany({
    where: status ? { status } : undefined,
    include: { doctor: { include: { user: { select: { name: true } } } } },
    orderBy: { createdAt: "desc" },
  });
}

export async function countPendingLeaveRequests() {
  return prisma.leaveRequest.count({ where: { status: "PENDING" } });
}

/** Approves a pending leave request: applies the actual leave days via markDoctorLeave
 *  (which notifies any already-booked patients), then records the decision. */
export async function approveLeaveRequest(requestId: string, decidedByName: string) {
  const request = await prisma.leaveRequest.findUnique({ where: { id: requestId } });
  if (!request) throw new NotFoundError("Leave request not found");
  if (request.status !== "PENDING") throw new AppError("This leave request has already been decided", 422);

  const result = await markDoctorLeave(
    request.doctorId,
    request.startDate.toISOString().slice(0, 10),
    request.endDate.toISOString().slice(0, 10),
    request.reason
  );

  const updated = await prisma.leaveRequest.update({
    where: { id: requestId },
    data: { status: "APPROVED", decidedByName, decidedAt: new Date() },
  });

  return { request: updated, ...result };
}

export async function rejectLeaveRequest(requestId: string, decidedByName: string, adminNote?: string | null) {
  const request = await prisma.leaveRequest.findUnique({ where: { id: requestId } });
  if (!request) throw new NotFoundError("Leave request not found");
  if (request.status !== "PENDING") throw new AppError("This leave request has already been decided", 422);

  return prisma.leaveRequest.update({
    where: { id: requestId },
    data: { status: "REJECTED", decidedByName, decidedAt: new Date(), adminNote },
  });
}
