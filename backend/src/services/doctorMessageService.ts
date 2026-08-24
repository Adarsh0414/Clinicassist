import { prisma } from "../config/db";
import { ForbiddenError, NotFoundError } from "../utils/errors";

interface CreateMessageInput {
  doctorId: string;
  category: string;
  subject: string;
  message: string;
}

export async function createDoctorMessage(input: CreateMessageInput) {
  return prisma.doctorMessage.create({ data: input });
}

export async function listMessagesForDoctor(doctorId: string) {
  return prisma.doctorMessage.findMany({ where: { doctorId }, orderBy: { createdAt: "desc" } });
}

export async function listAllMessages(status?: "OPEN" | "RESOLVED") {
  return prisma.doctorMessage.findMany({
    where: status ? { status } : undefined,
    include: { doctor: { include: { user: { select: { name: true } } } } },
    orderBy: { createdAt: "desc" },
  });
}

export async function replyToMessage(messageId: string, adminReply: string) {
  const msg = await prisma.doctorMessage.findUnique({ where: { id: messageId } });
  if (!msg) throw new NotFoundError("Message not found");
  return prisma.doctorMessage.update({
    where: { id: messageId },
    data: { adminReply, status: "RESOLVED", repliedAt: new Date(), readByDoctor: false, readByAdmin: true },
  });
}

/**
 * Deletes a single message. Admins can delete any message (inbox cleanup); a doctor
 * may only delete their own — this is a personal declutter action, not a moderation one.
 */
export async function deleteMessage(messageId: string, requester: { role: "ADMIN" | "DOCTOR"; doctorId?: string }) {
  const msg = await prisma.doctorMessage.findUnique({ where: { id: messageId } });
  if (!msg) throw new NotFoundError("Message not found");
  if (requester.role === "DOCTOR" && msg.doctorId !== requester.doctorId) {
    throw new ForbiddenError("You can only delete your own messages");
  }
  await prisma.doctorMessage.delete({ where: { id: messageId } });
}

/** Bulk-clear resolved messages so old, already-answered tickets don't pile up. */
export async function clearResolvedForDoctor(doctorId: string) {
  await prisma.doctorMessage.deleteMany({ where: { doctorId, status: "RESOLVED" } });
}

export async function clearResolvedForAdmin() {
  await prisma.doctorMessage.deleteMany({ where: { status: "RESOLVED" } });
}

export async function getUnreadCountForAdmin() {
  return prisma.doctorMessage.count({ where: { readByAdmin: false } });
}

export async function markAllReadForAdmin() {
  await prisma.doctorMessage.updateMany({ where: { readByAdmin: false }, data: { readByAdmin: true } });
}

export async function getUnreadCountForDoctor(doctorId: string) {
  return prisma.doctorMessage.count({ where: { doctorId, readByDoctor: false } });
}

export async function markAllReadForDoctor(doctorId: string) {
  await prisma.doctorMessage.updateMany({ where: { doctorId, readByDoctor: false }, data: { readByDoctor: true } });
}
