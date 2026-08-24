import { Router } from "express";
import { authenticate, requireRole } from "../middleware/auth";
import { createDoctorMessageSchema, replyDoctorMessageSchema } from "../utils/validation";
import {
  clearResolvedForAdmin,
  clearResolvedForDoctor,
  createDoctorMessage,
  deleteMessage,
  getUnreadCountForAdmin,
  getUnreadCountForDoctor,
  listAllMessages,
  listMessagesForDoctor,
  markAllReadForAdmin,
  markAllReadForDoctor,
  replyToMessage,
} from "../services/doctorMessageService";
import { getDoctorByUserId } from "../services/doctorService";
import { recordAudit } from "../services/auditService";

export const doctorMessagesRouter = Router();
doctorMessagesRouter.use(authenticate);

doctorMessagesRouter.post("/", requireRole("DOCTOR"), async (req, res) => {
  const data = createDoctorMessageSchema.parse(req.body);
  const doctor = await getDoctorByUserId(req.auth!.userId);
  const msg = await createDoctorMessage({ doctorId: doctor.id, ...data });
  res.status(201).json(msg);
});

// --- Doctor's own inbox (must be registered before the generic "/:id" routes) ---

doctorMessagesRouter.get("/mine", requireRole("DOCTOR"), async (req, res) => {
  const doctor = await getDoctorByUserId(req.auth!.userId);
  const messages = await listMessagesForDoctor(doctor.id);
  res.json(messages);
});

doctorMessagesRouter.get("/mine/unread-count", requireRole("DOCTOR"), async (req, res) => {
  const doctor = await getDoctorByUserId(req.auth!.userId);
  const count = await getUnreadCountForDoctor(doctor.id);
  res.json({ count });
});

doctorMessagesRouter.post("/mine/mark-read", requireRole("DOCTOR"), async (req, res) => {
  const doctor = await getDoctorByUserId(req.auth!.userId);
  await markAllReadForDoctor(doctor.id);
  res.status(204).send();
});

// Lets a doctor clear their own resolved tickets so old, already-answered messages
// don't keep piling up in their history.
doctorMessagesRouter.delete("/mine/resolved", requireRole("DOCTOR"), async (req, res) => {
  const doctor = await getDoctorByUserId(req.auth!.userId);
  await clearResolvedForDoctor(doctor.id);
  res.status(204).send();
});

// --- Admin inbox ---

doctorMessagesRouter.get("/unread-count", requireRole("ADMIN"), async (_req, res) => {
  const count = await getUnreadCountForAdmin();
  res.json({ count });
});

doctorMessagesRouter.post("/mark-all-read", requireRole("ADMIN"), async (_req, res) => {
  await markAllReadForAdmin();
  res.status(204).send();
});

// Bulk-clear resolved tickets from the admin inbox. Registered before "/:id" so it
// isn't swallowed by the generic id route.
doctorMessagesRouter.delete("/resolved", requireRole("ADMIN"), async (_req, res) => {
  await clearResolvedForAdmin();
  res.status(204).send();
});

doctorMessagesRouter.get("/", requireRole("ADMIN"), async (req, res) => {
  const status = req.query.status === "OPEN" || req.query.status === "RESOLVED" ? req.query.status : undefined;
  const messages = await listAllMessages(status);
  res.json(
    messages.map((m: (typeof messages)[number]) => ({
      id: m.id,
      doctorName: m.doctor.user.name,
      category: m.category,
      subject: m.subject,
      message: m.message,
      status: m.status,
      adminReply: m.adminReply,
      repliedAt: m.repliedAt,
      createdAt: m.createdAt,
    }))
  );
});

doctorMessagesRouter.post("/:id/reply", requireRole("ADMIN"), async (req, res) => {
  const data = replyDoctorMessageSchema.parse(req.body);
  const updated = await replyToMessage(req.params.id, data.adminReply);
  await recordAudit({
    actorUserId: req.auth!.userId,
    actorRole: "ADMIN",
    action: "doctor_message.replied",
    targetType: "DoctorMessage",
    targetId: req.params.id,
  });
  res.json(updated);
});

// A doctor may delete their own message; an admin may delete any message (inbox cleanup).
doctorMessagesRouter.delete("/:id", requireRole("ADMIN", "DOCTOR"), async (req, res) => {
  const doctor = req.auth!.role === "DOCTOR" ? await getDoctorByUserId(req.auth!.userId) : undefined;
  await deleteMessage(req.params.id, { role: req.auth!.role as "ADMIN" | "DOCTOR", doctorId: doctor?.id });
  if (req.auth!.role === "ADMIN") {
    await recordAudit({
      actorUserId: req.auth!.userId,
      actorRole: "ADMIN",
      action: "doctor_message.deleted",
      targetType: "DoctorMessage",
      targetId: req.params.id,
    });
  }
  res.status(204).send();
});
