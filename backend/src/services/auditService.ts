import { prisma } from "../config/db";

interface AuditInput {
  actorUserId: string;
  actorRole: string;
  action: string;
  targetType: string;
  targetId?: string | null;
  details?: string | null;
}

/** Writes an audit entry, looking up the actor's current display name for the
 *  denormalized snapshot. Never throws — an audit-log failure should never break the
 *  actual operation it's recording, so errors are swallowed and logged to the console. */
export async function recordAudit(input: AuditInput): Promise<void> {
  try {
    const actor = await prisma.user.findUnique({ where: { id: input.actorUserId }, select: { name: true } });
    await prisma.auditLog.create({
      data: {
        actorUserId: input.actorUserId,
        actorName: actor?.name ?? "Unknown",
        actorRole: input.actorRole,
        action: input.action,
        targetType: input.targetType,
        targetId: input.targetId,
        details: input.details,
      },
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[audit] Failed to write audit log entry:", err instanceof Error ? err.message : err);
  }
}

export async function listAuditLog(limit = 200) {
  return prisma.auditLog.findMany({ orderBy: { createdAt: "desc" }, take: limit });
}
