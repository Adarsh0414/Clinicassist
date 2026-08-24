import { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { AppError } from "../utils/errors";

// Express recognizes this as an error handler because it has 4 arguments.
export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof ZodError) {
    return res.status(422).json({
      error: "ValidationError",
      message: "Request data failed validation.",
      details: err.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
    });
  }

  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      error: err.name,
      message: err.message,
      details: err.details,
    });
  }

  // Prisma unique-constraint violation surfaces as P2002; we mostly catch this
  // ourselves at the call site for friendlier messages, but this is a safety net.
  if (typeof err === "object" && err !== null && "code" in err && (err as { code: string }).code === "P2002") {
    return res.status(409).json({
      error: "ConflictError",
      message: "That resource already exists or conflicts with an existing record.",
    });
  }

  // eslint-disable-next-line no-console
  console.error("Unhandled error:", err);
  return res.status(500).json({
    error: "InternalServerError",
    message: "Something went wrong on our end. Please try again.",
  });
}
