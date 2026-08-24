/**
 * Checks whether a caught error is a Prisma unique-constraint violation
 * (error code P2002) without depending on `instanceof Prisma.PrismaClientKnownRequestError`,
 * which keeps this resilient to Prisma client generation/version differences.
 */
export function isUniqueConstraintError(err: unknown): boolean {
  return typeof err === "object" && err !== null && "code" in err && (err as { code?: unknown }).code === "P2002";
}
