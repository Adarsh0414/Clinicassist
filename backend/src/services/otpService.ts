import bcrypt from "bcryptjs";
import { prisma } from "../config/db";
import { env } from "../config/env";
import { AppError } from "../utils/errors";

export type OtpPurpose = "VERIFY_EMAIL" | "RESET_PASSWORD";

function generateSixDigitCode(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

/** Generates a new OTP for a user, stores its hash + expiry + purpose, and returns the
 *  plaintext code so the caller can email it (never store the plaintext code). */
export async function issueOtp(userId: string, purpose: OtpPurpose): Promise<string> {
  const code = generateSixDigitCode();
  const otpCodeHash = await bcrypt.hash(code, 10);
  const otpExpiresAt = new Date(Date.now() + env.otpExpiryMinutes * 60 * 1000);

  await prisma.user.update({
    where: { id: userId },
    data: { otpCodeHash, otpExpiresAt, otpPurpose: purpose },
  });

  return code;
}

/** Verifies a submitted code against the stored hash for the given purpose, and clears it on success. */
export async function verifyOtp(userId: string, purpose: OtpPurpose, submittedCode: string): Promise<void> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || !user.otpCodeHash || !user.otpExpiresAt || user.otpPurpose !== purpose) {
    throw new AppError("No verification code is pending for this account. Please request a new one.", 400);
  }
  if (user.otpExpiresAt < new Date()) {
    throw new AppError("This code has expired. Please request a new one.", 400);
  }
  const valid = await bcrypt.compare(submittedCode, user.otpCodeHash);
  if (!valid) {
    throw new AppError("That code is incorrect. Please check it and try again.", 400);
  }

  await prisma.user.update({
    where: { id: userId },
    data: { otpCodeHash: null, otpExpiresAt: null, otpPurpose: null },
  });
}
