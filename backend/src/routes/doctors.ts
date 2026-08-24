import { Router } from "express";
import bcrypt from "bcryptjs";
import { authenticate, requireRole } from "../middleware/auth";
import { createDoctorSchema, decideLeaveRequestSchema, markLeaveSchema, requestLeaveSchema, updateDoctorSchema, updateOwnDoctorProfileSchema } from "../utils/validation";
import {
  approveLeaveRequest,
  createDoctor,
  deleteDoctor,
  getDoctorByUserId,
  listDoctors,
  listDoctorLeaves,
  listAllLeaveRequests,
  listLeaveRequestsForDoctor,
  countPendingLeaveRequests,
  markDoctorLeave,
  rejectLeaveRequest,
  requestLeave,
  updateDoctorProfile,
} from "../services/doctorService";
import { getAvailableSlots } from "../services/appointmentService";
import { recordAudit } from "../services/auditService";
import { prisma } from "../config/db";
import { NotFoundError } from "../utils/errors";

export const doctorsRouter = Router();

// --- Doctor self-service (must be registered before the generic "/:doctorId" routes) ---

doctorsRouter.get("/me", authenticate, requireRole("DOCTOR"), async (req, res) => {
  const doctor = await getDoctorByUserId(req.auth!.userId);
  res.json({
    id: doctor.id,
    name: doctor.user.name,
    email: doctor.user.email,
    phone: doctor.user.phone,
    specialization: doctor.specialization,
    slotDurationMinutes: doctor.slotDurationMinutes,
    workingHours: JSON.parse(doctor.workingHoursJson),
    bio: doctor.bio,
    qualifications: doctor.qualifications,
    yearsOfExperience: doctor.yearsOfExperience,
    consultationFee: doctor.consultationFee,
  });
});

/** A doctor edits their own specialization/bio/hours/fee — no admin needed. */
doctorsRouter.patch("/me", authenticate, requireRole("DOCTOR"), async (req, res) => {
  const data = updateOwnDoctorProfileSchema.parse(req.body);
  const doctor = await getDoctorByUserId(req.auth!.userId);
  const updated = await updateDoctorProfile(doctor.id, data);
  await recordAudit({
    actorUserId: req.auth!.userId,
    actorRole: "DOCTOR",
    action: "doctor.updated_own_profile",
    targetType: "DoctorProfile",
    targetId: doctor.id,
  });
  res.json(updated);
});

/** A doctor's approved leave days — only populated once an admin has approved a request
 *  below, since a doctor can no longer mark themselves on leave directly. */
doctorsRouter.get("/me/leave", authenticate, requireRole("DOCTOR"), async (req, res) => {
  const doctor = await getDoctorByUserId(req.auth!.userId);
  const leaves = await listDoctorLeaves(doctor.id);
  res.json(leaves);
});

/** A doctor requests time off — a single day or a date range. This does NOT block the
 *  calendar yet: it files a PENDING request that only takes effect once an admin approves
 *  it (see /leave-requests/:id/approve below). */
doctorsRouter.post("/me/leave-requests", authenticate, requireRole("DOCTOR"), async (req, res) => {
  const data = requestLeaveSchema.parse(req.body);
  const doctor = await getDoctorByUserId(req.auth!.userId);
  const request = await requestLeave(doctor.id, data.startDate, data.endDate, data.reason);
  await recordAudit({
    actorUserId: req.auth!.userId,
    actorRole: "DOCTOR",
    action: "doctor.requested_leave",
    targetType: "DoctorProfile",
    targetId: doctor.id,
    details: `Requested ${data.startDate} to ${data.endDate}`,
  });
  res.status(201).json({
    message: "Your time-off request has been sent to the admin for approval.",
    request,
  });
});

/** A doctor's own leave requests, most recent first — pending, approved, and rejected. */
doctorsRouter.get("/me/leave-requests", authenticate, requireRole("DOCTOR"), async (req, res) => {
  const doctor = await getDoctorByUserId(req.auth!.userId);
  const requests = await listLeaveRequestsForDoctor(doctor.id);
  res.json(requests);
});

// --- Admin: reviewing leave requests (must be registered before "/:doctorId" routes) ---

doctorsRouter.get("/leave-requests/pending-count", authenticate, requireRole("ADMIN"), async (_req, res) => {
  const count = await countPendingLeaveRequests();
  res.json({ count });
});

doctorsRouter.get("/leave-requests", authenticate, requireRole("ADMIN"), async (req, res) => {
  const status = req.query.status === "PENDING" || req.query.status === "APPROVED" || req.query.status === "REJECTED" ? req.query.status : undefined;
  const requests = await listAllLeaveRequests(status);
  res.json(
    requests.map((r: (typeof requests)[number]) => ({
      id: r.id,
      doctorId: r.doctorId,
      doctorName: r.doctor.user.name,
      startDate: r.startDate,
      endDate: r.endDate,
      reason: r.reason,
      status: r.status,
      adminNote: r.adminNote,
      decidedByName: r.decidedByName,
      decidedAt: r.decidedAt,
      createdAt: r.createdAt,
    }))
  );
});

doctorsRouter.post("/leave-requests/:id/approve", authenticate, requireRole("ADMIN"), async (req, res) => {
  const admin = await prisma.user.findUnique({ where: { id: req.auth!.userId }, select: { name: true } });
  const { request, affectedCount, dayCount } = await approveLeaveRequest(req.params.id, admin?.name ?? "Admin");
  await recordAudit({
    actorUserId: req.auth!.userId,
    actorRole: "ADMIN",
    action: "doctor.leave_request_approved",
    targetType: "LeaveRequest",
    targetId: request.id,
    details: `${affectedCount} appointment(s) affected`,
  });
  res.json({
    message: `Approved. Leave recorded for ${dayCount} day(s). ${affectedCount} patient(s) notified about rescheduling.`,
    request,
  });
});

doctorsRouter.post("/leave-requests/:id/reject", authenticate, requireRole("ADMIN"), async (req, res) => {
  const data = decideLeaveRequestSchema.parse(req.body);
  const admin = await prisma.user.findUnique({ where: { id: req.auth!.userId }, select: { name: true } });
  const request = await rejectLeaveRequest(req.params.id, admin?.name ?? "Admin", data.adminNote);
  await recordAudit({
    actorUserId: req.auth!.userId,
    actorRole: "ADMIN",
    action: "doctor.leave_request_rejected",
    targetType: "LeaveRequest",
    targetId: request.id,
  });
  res.json({ message: "Leave request declined.", request });
});

// --- Public / admin routes ---


// Public: patients browse doctors by specialization before logging in isn't required by the
// brief, but authenticate() is cheap here and keeps things consistent — patients must be logged
// in to book anyway. We keep listing open to any authenticated role.
doctorsRouter.get("/", authenticate, async (req, res) => {
  const specialization = typeof req.query.specialization === "string" ? req.query.specialization : undefined;
  const doctors = await listDoctors(specialization);
  res.json(
    doctors.map((d: (typeof doctors)[number]) => ({
      id: d.id,
      name: d.user.name,
      specialization: d.specialization,
      slotDurationMinutes: d.slotDurationMinutes,
      workingHours: JSON.parse(d.workingHoursJson),
      bio: d.bio,
      qualifications: d.qualifications,
      yearsOfExperience: d.yearsOfExperience,
      consultationFee: d.consultationFee,
    }))
  );
});

doctorsRouter.get("/:doctorId/slots", authenticate, async (req, res) => {
  const date = typeof req.query.date === "string" ? req.query.date : undefined;
  if (!date) throw new NotFoundError("Provide a ?date=YYYY-MM-DD query parameter");
  const slots = await getAvailableSlots(req.params.doctorId, date);
  res.json({ doctorId: req.params.doctorId, date, slots });
});

doctorsRouter.post("/", authenticate, requireRole("ADMIN"), async (req, res) => {
  const data = createDoctorSchema.parse(req.body);
  const passwordHash = await bcrypt.hash(data.password, 10);
  const doctor = await createDoctor({ ...data, passwordHash });
  await recordAudit({
    actorUserId: req.auth!.userId,
    actorRole: "ADMIN",
    action: "doctor.created",
    targetType: "DoctorProfile",
    targetId: doctor.doctorProfile!.id,
    details: `Dr. ${doctor.name} (${doctor.doctorProfile!.specialization})`,
  });
  res.status(201).json({
    id: doctor.doctorProfile!.id,
    userId: doctor.id,
    name: doctor.name,
    email: doctor.email,
    specialization: doctor.doctorProfile!.specialization,
  });
});

doctorsRouter.patch("/:doctorId", authenticate, requireRole("ADMIN"), async (req, res) => {
  const data = updateDoctorSchema.parse(req.body);
  const updated = await updateDoctorProfile(req.params.doctorId, data);
  await recordAudit({
    actorUserId: req.auth!.userId,
    actorRole: "ADMIN",
    action: "doctor.updated",
    targetType: "DoctorProfile",
    targetId: req.params.doctorId,
  });
  res.json(updated);
});

doctorsRouter.delete("/:doctorId", authenticate, requireRole("ADMIN"), async (req, res) => {
  const doctor = await prisma.doctorProfile.findUnique({ where: { id: req.params.doctorId }, include: { user: true } });
  await deleteDoctor(req.params.doctorId);
  await recordAudit({
    actorUserId: req.auth!.userId,
    actorRole: "ADMIN",
    action: "doctor.deleted",
    targetType: "DoctorProfile",
    targetId: req.params.doctorId,
    details: doctor ? `Dr. ${doctor.user.name}` : undefined,
  });
  res.status(204).send();
});

doctorsRouter.post("/:doctorId/leave", authenticate, requireRole("ADMIN"), async (req, res) => {
  const data = markLeaveSchema.parse(req.body);
  const result = await markDoctorLeave(req.params.doctorId, data.startDate, data.endDate, data.reason);
  await recordAudit({
    actorUserId: req.auth!.userId,
    actorRole: "ADMIN",
    action: "doctor.leave_marked",
    targetType: "DoctorProfile",
    targetId: req.params.doctorId,
    details: `${data.startDate} to ${data.endDate}, ${result.affectedCount} appointment(s) affected`,
  });
  res.status(201).json({
    message: `Leave recorded for ${result.dayCount} day(s). ${result.affectedCount} patient(s) notified about rescheduling.`,
    ...result,
  });
});

doctorsRouter.get("/:doctorId/leave", authenticate, async (req, res) => {
  const leaves = await listDoctorLeaves(req.params.doctorId);
  res.json(leaves);
});

doctorsRouter.get("/:doctorId", authenticate, async (req, res) => {
  const doctor = await prisma.doctorProfile.findUnique({
    where: { id: req.params.doctorId },
    include: { user: { select: { name: true, email: true } } },
  });
  if (!doctor) throw new NotFoundError("Doctor not found");
  res.json({
    id: doctor.id,
    name: doctor.user.name,
    specialization: doctor.specialization,
    slotDurationMinutes: doctor.slotDurationMinutes,
    workingHours: JSON.parse(doctor.workingHoursJson),
    bio: doctor.bio,
  });
});
