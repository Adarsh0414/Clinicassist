import { Router } from "express";
import { authenticate, requireRole } from "../middleware/auth";
import { prisma } from "../config/db";
import { listAuditLog } from "../services/auditService";
import { NotFoundError } from "../utils/errors";

export const adminRouter = Router();
adminRouter.use(authenticate, requireRole("ADMIN"));

adminRouter.get("/appointments", async (req, res) => {
  const status = typeof req.query.status === "string" ? req.query.status : undefined;
  const appts = await prisma.appointment.findMany({
    where: status ? { status: status as any } : undefined,
    include: {
      patient: { include: { user: { select: { name: true, email: true } } } },
      doctor: { include: { user: { select: { name: true } } } },
    },
    orderBy: { slotStart: "desc" },
    take: 200,
  });
  res.json(
    appts.map((a: (typeof appts)[number]) => ({
      id: a.id,
      status: a.status,
      slotStart: a.slotStart,
      doctorName: a.doctor.user.name,
      patientName: a.patient.user.name,
      patientEmail: a.patient.user.email,
    }))
  );
});

adminRouter.get("/notifications", async (req, res) => {
  const status = typeof req.query.status === "string" ? req.query.status : undefined;
  const logs = await prisma.notificationLog.findMany({
    where: status ? { status: status as any } : undefined,
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  res.json(logs);
});

// Bulk-clear notification logs so old delivery records don't keep piling up. Registered
// before "/notifications/:id" so it isn't swallowed by the generic id route. Optional
// ?status= narrows the clear (e.g. only SENT ones, keeping FAILED for follow-up).
adminRouter.delete("/notifications", async (req, res) => {
  const status = typeof req.query.status === "string" ? req.query.status : undefined;
  await prisma.notificationLog.deleteMany({ where: status ? { status: status as any } : undefined });
  res.status(204).send();
});

adminRouter.delete("/notifications/:id", async (req, res) => {
  const existing = await prisma.notificationLog.findUnique({ where: { id: req.params.id } });
  if (!existing) throw new NotFoundError("Notification not found");
  await prisma.notificationLog.delete({ where: { id: req.params.id } });
  res.status(204).send();
});

adminRouter.get("/stats", async (_req, res) => {
  const [totalPatients, totalDoctors, totalAppointments, upcomingConfirmed, failedNotifications] = await Promise.all([
    prisma.patientProfile.count(),
    prisma.doctorProfile.count(),
    prisma.appointment.count(),
    prisma.appointment.count({ where: { status: "CONFIRMED", slotStart: { gte: new Date() } } }),
    prisma.notificationLog.count({ where: { status: "FAILED" } }),
  ]);
  res.json({ totalPatients, totalDoctors, totalAppointments, upcomingConfirmed, failedNotifications });
});

/** Traceability log — who did what, to which record, when. See AuditLog model comment. */
adminRouter.get("/audit-log", async (_req, res) => {
  const entries = await listAuditLog(200);
  res.json(entries);
});
