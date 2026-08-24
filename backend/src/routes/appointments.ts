import { Router } from "express";
import { authenticate, requireRole } from "../middleware/auth";
import { bookAppointmentSchema, cancelAppointmentSchema, rescheduleAppointmentSchema, visitNotesSchema } from "../utils/validation";
import {
  bookAppointment,
  cancelAppointment,
  getPatientHistory,
  getQueueStatus,
  getTodayQueue,
  markAppointmentReadByPatient,
  markNoShow,
  rescheduleAppointment,
  startConsultation,
  submitVisitNotes,
} from "../services/appointmentService";
import { getDoctorByUserId } from "../services/doctorService";
import { recordAudit } from "../services/auditService";
import { generatePrescriptionPdf } from "../services/pdfService";
import { prisma } from "../config/db";
import { ForbiddenError, NotFoundError } from "../utils/errors";

export const appointmentsRouter = Router();

appointmentsRouter.post("/", authenticate, requireRole("PATIENT"), async (req, res) => {
  const data = bookAppointmentSchema.parse(req.body);
  const appt = await bookAppointment({
    patientId: req.auth!.patientProfileId!,
    doctorId: data.doctorId,
    slotStartIso: data.slotStart,
    symptomsText: data.symptomsText,
    patientMobile: data.patientMobile,
  });
  res.status(201).json(serializeAppointment(appt));
});

/** Returns the caller's own appointments — shape depends on role. */
appointmentsRouter.get("/mine", authenticate, async (req, res) => {
  const { role, patientProfileId, doctorProfileId } = req.auth!;

  if (role === "PATIENT") {
    const appts = await prisma.appointment.findMany({
      where: { patientId: patientProfileId! },
      include: { doctor: { include: { user: true } } },
      orderBy: { slotStart: "desc" },
    });
    return res.json(appts.map(serializeAppointment));
  }

  if (role === "DOCTOR") {
    const appts = await prisma.appointment.findMany({
      where: { doctorId: doctorProfileId! },
      include: { patient: { include: { user: true } } },
      orderBy: { slotStart: "asc" },
    });
    return res.json(appts.map(serializeAppointment));
  }

  throw new ForbiddenError("Admins should use /api/admin endpoints for a full appointment overview");
});

/** Today's queue for the logged-in doctor, sorted by token — powers the "Now Serving" panel. */
/** Count of appointments needing patient attention — the doctor went on leave and it needs
 *  rebooking, or there's an update the patient hasn't seen yet (a visit was completed with
 *  notes/prescription). Powers the badge on the patient's "My appointments" nav link. */
appointmentsRouter.get("/attention-count", authenticate, requireRole("PATIENT"), async (req, res) => {
  const count = await prisma.appointment.count({
    where: {
      patientId: req.auth!.patientProfileId!,
      OR: [{ status: "RESCHEDULE_NEEDED" }, { readByPatient: false }],
    },
  });
  res.json({ count });
});

/** The patient has opened this appointment — clears its "new update" badge. */
appointmentsRouter.post("/:id/mark-read", authenticate, requireRole("PATIENT"), async (req, res) => {
  const updated = await markAppointmentReadByPatient(req.params.id, req.auth!.patientProfileId!);
  res.json(serializeAppointment(updated));
});

appointmentsRouter.get("/queue/today", authenticate, requireRole("DOCTOR"), async (req, res) => {
  const doctor = await getDoctorByUserId(req.auth!.userId);
  const queue = await getTodayQueue(doctor.id);
  res.json(queue.map(serializeAppointment));
});

/** Queue status for one appointment — what the patient sees ("your token, now serving, wait"). */
appointmentsRouter.get("/:id/queue-status", authenticate, async (req, res) => {
  const status = await getQueueStatus(req.params.id);
  res.json(status);
});

appointmentsRouter.post("/:id/start", authenticate, requireRole("DOCTOR"), async (req, res) => {
  const updated = await startConsultation(req.params.id, req.auth!.userId);
  res.json(serializeAppointment(updated));
});

appointmentsRouter.post("/:id/no-show", authenticate, requireRole("DOCTOR"), async (req, res) => {
  const updated = await markNoShow(req.params.id, req.auth!.userId);
  await recordAudit({
    actorUserId: req.auth!.userId,
    actorRole: req.auth!.role,
    action: "appointment.no_show",
    targetType: "Appointment",
    targetId: req.params.id,
  });
  res.json(serializeAppointment(updated));
});

appointmentsRouter.post("/:id/cancel", authenticate, async (req, res) => {
  const data = cancelAppointmentSchema.parse(req.body ?? {});
  const updated = await cancelAppointment({
    appointmentId: req.params.id,
    actingUserId: req.auth!.userId,
    actingRole: req.auth!.role,
    reason: data.reason,
    customReason: data.customReason,
  });
  await recordAudit({
    actorUserId: req.auth!.userId,
    actorRole: req.auth!.role,
    action: "appointment.cancelled",
    targetType: "Appointment",
    targetId: req.params.id,
    details: data.reason ? `Reason: ${data.reason === "Other" ? data.customReason ?? "Other" : data.reason}` : undefined,
  });
  res.json(serializeAppointment(updated));
});

appointmentsRouter.post("/:id/reschedule", authenticate, async (req, res) => {
  const data = rescheduleAppointmentSchema.parse(req.body);
  const updated = await rescheduleAppointment({
    appointmentId: req.params.id,
    actingUserId: req.auth!.userId,
    actingRole: req.auth!.role,
    newSlotStartIso: data.slotStart,
  });
  await recordAudit({
    actorUserId: req.auth!.userId,
    actorRole: req.auth!.role,
    action: "appointment.rescheduled",
    targetType: "Appointment",
    targetId: req.params.id,
    details: `New time: ${updated.slotStart.toISOString()}`,
  });
  res.json(serializeAppointment(updated));
});

appointmentsRouter.post("/:id/visit-notes", authenticate, requireRole("DOCTOR"), async (req, res) => {
  const data = visitNotesSchema.parse(req.body);
  const updated = await submitVisitNotes({
    appointmentId: req.params.id,
    doctorUserId: req.auth!.userId,
    doctorNotes: data.doctorNotes,
    prescription: data.prescription,
    followUpRecommended: data.followUpRecommended,
    followUpAfterDays: data.followUpAfterDays,
  });
  await recordAudit({
    actorUserId: req.auth!.userId,
    actorRole: req.auth!.role,
    action: "appointment.visit_completed",
    targetType: "Appointment",
    targetId: req.params.id,
  });
  res.json(serializeAppointment(updated));
});

/** A patient's past completed visits — the basic EMR history view shown alongside the
 *  current appointment. Doctor must have access to the appointment they're viewing it from. */
appointmentsRouter.get("/:id/history", authenticate, requireRole("DOCTOR", "ADMIN"), async (req, res) => {
  const appt = await prisma.appointment.findUnique({ where: { id: req.params.id }, include: { doctor: true } });
  if (!appt) throw new NotFoundError("Appointment not found");
  if (req.auth!.role === "DOCTOR" && appt.doctor.userId !== req.auth!.userId) {
    throw new ForbiddenError("You can only view history for your own patients");
  }
  const history = await getPatientHistory(appt.patientId, appt.id);
  res.json(
    history.map((h: (typeof history)[number]) => ({
      id: h.id,
      slotStart: h.slotStart,
      doctorName: h.doctor.user.name,
      doctorNotes: h.doctorNotes,
      prescription: h.prescriptionJson ? JSON.parse(h.prescriptionJson) : null,
      followUpRecommended: h.followUpRecommended,
      followUpAfterDays: h.followUpAfterDays,
    }))
  );
});

/** Downloadable, print-ready prescription PDF — only once a visit is completed. */
appointmentsRouter.get("/:id/prescription-pdf", authenticate, async (req, res) => {
  const appt = await prisma.appointment.findUnique({
    where: { id: req.params.id },
    include: { patient: { include: { user: true } }, doctor: { include: { user: true } } },
  });
  if (!appt) throw new NotFoundError("Appointment not found");

  const { role, userId } = req.auth!;
  const owns = (role === "PATIENT" && appt.patient.userId === userId) || (role === "DOCTOR" && appt.doctor.userId === userId) || role === "ADMIN";
  if (!owns) throw new ForbiddenError("You don't have access to this appointment");
  if (appt.status !== "COMPLETED" || !appt.prescriptionJson) {
    throw new NotFoundError("No prescription is available for this appointment yet");
  }

  const pdfBuffer = await generatePrescriptionPdf({
    patientName: appt.patient.user.name,
    patientBloodGroup: appt.patient.bloodGroup,
    patientAllergies: appt.patient.allergies,
    doctorName: appt.doctor.user.name,
    specialization: appt.doctor.specialization,
    qualifications: appt.doctor.qualifications,
    visitDate: appt.slotStart,
    diagnosis: appt.doctorNotes ?? "",
    prescription: JSON.parse(appt.prescriptionJson),
    followUpRecommended: appt.followUpRecommended,
    followUpAfterDays: appt.followUpAfterDays,
    appointmentId: appt.id,
  });

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="prescription-${appt.id.slice(0, 8)}.pdf"`);
  res.send(pdfBuffer);
});

appointmentsRouter.get("/:id", authenticate, async (req, res) => {
  const appt = await prisma.appointment.findUnique({
    where: { id: req.params.id },
    include: { patient: { include: { user: true } }, doctor: { include: { user: true } } },
  });
  if (!appt) throw new NotFoundError("Appointment not found");

  const { role, userId } = req.auth!;
  const owns =
    (role === "PATIENT" && appt.patient.userId === userId) ||
    (role === "DOCTOR" && appt.doctor.userId === userId) ||
    role === "ADMIN";
  if (!owns) throw new ForbiddenError("You don't have access to this appointment");

  res.json(serializeAppointment(appt));
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function serializeAppointment(appt: any) {
  return {
    id: appt.id,
    status: appt.status,
    slotStart: appt.slotStart,
    slotEnd: appt.slotEnd,
    tokenNumber: appt.tokenNumber,
    patientMobile: appt.patientMobile,
    symptomsText: appt.symptomsText,
    preVisitSummary: appt.preVisitSummaryJson ? JSON.parse(appt.preVisitSummaryJson) : null,
    preVisitLlmFailed: appt.preVisitLlmFailed,
    doctorNotes: appt.doctorNotes,
    prescription: appt.prescriptionJson ? JSON.parse(appt.prescriptionJson) : null,
    postVisitSummary: appt.postVisitSummaryText,
    postVisitLlmFailed: appt.postVisitLlmFailed,
    followUpRecommended: appt.followUpRecommended,
    followUpAfterDays: appt.followUpAfterDays,
    cancellationReason: appt.cancellationReason,
    readByPatient: appt.readByPatient,
    doctor: appt.doctor ? { id: appt.doctor.id, name: appt.doctor.user?.name, specialization: appt.doctor.specialization } : undefined,
    patient: appt.patient
      ? {
          id: appt.patient.id,
          name: appt.patient.user?.name,
          email: appt.patient.user?.email,
          bloodGroup: appt.patient.bloodGroup,
          allergies: appt.patient.allergies,
          medicalConditions: appt.patient.medicalConditions,
        }
      : undefined,
    createdAt: appt.createdAt,
  };
}
