import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import { OAuth2Client } from "google-auth-library";
import { prisma } from "../config/db";
import { env } from "../config/env";
import {
  changePasswordSchema,
  forgotPasswordSchema,
  googleSignInSchema,
  loginSchema,
  registerPatientSchema,
  resendOtpSchema,
  resetPasswordSchema,
  updateMeSchema,
  verifyOtpSchema,
} from "../utils/validation";
import { AppError, ConflictError, UnauthorizedError } from "../utils/errors";
import { authenticate } from "../middleware/auth";
import { issueOtp, verifyOtp } from "../services/otpService";
import { sendEmail, emailTemplates } from "../services/emailService";

export const authRouter = Router();

const googleClient = env.googleClientId ? new OAuth2Client(env.googleClientId) : null;

function signToken(payload: object) {
  return jwt.sign(payload, env.jwtSecret, { expiresIn: env.jwtExpiresIn } as jwt.SignOptions);
}

async function sendOtpEmail(userId: string, name: string, email: string, purpose: "VERIFY_EMAIL" | "RESET_PASSWORD") {
  const code = await issueOtp(userId, purpose);
  await sendEmail({
    to: email,
    subject: purpose === "VERIFY_EMAIL" ? "Verify your ClinicAssist email" : "Reset your ClinicAssist password",
    html: emailTemplates.otpCode(name, code, purpose, env.otpExpiryMinutes),
    type: "BOOKING_CONFIRMATION", // reuses an existing NotificationType; OTP delivery is still logged either way
  });
}

/** Public self-registration — patients only. Doctors/admins are provisioned by an admin.
 *  Does NOT log the user in immediately: an OTP is emailed and the account stays
 *  unverified until POST /auth/verify-otp succeeds. */
authRouter.post("/register", async (req, res) => {
  const data = registerPatientSchema.parse(req.body);

  const existing = await prisma.user.findUnique({ where: { email: data.email } });
  if (existing) throw new ConflictError("An account with this email already exists");

  const passwordHash = await bcrypt.hash(data.password, 10);
  const user = await prisma.user.create({
    data: {
      name: data.name,
      email: data.email,
      passwordHash,
      phone: data.phone,
      role: "PATIENT",
      emailVerified: false,
      patientProfile: {
        create: {
          dob: data.dob ? new Date(data.dob) : undefined,
          gender: data.gender,
        },
      },
    },
    include: { patientProfile: true },
  });

  await sendOtpEmail(user.id, user.name, user.email, "VERIFY_EMAIL");

  res.status(201).json({ requiresVerification: true, email: user.email });
});

authRouter.post("/verify-otp", async (req, res) => {
  const data = verifyOtpSchema.parse(req.body);
  const user = await prisma.user.findUnique({
    where: { email: data.email },
    include: { doctorProfile: true, patientProfile: true },
  });
  if (!user) throw new AppError("No account found for that email", 404);

  await verifyOtp(user.id, "VERIFY_EMAIL", data.code);
  await prisma.user.update({ where: { id: user.id }, data: { emailVerified: true } });

  const token = signToken({
    userId: user.id,
    role: user.role,
    doctorProfileId: user.doctorProfile?.id,
    patientProfileId: user.patientProfile?.id,
  });
  res.json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role } });
});

authRouter.post("/resend-otp", async (req, res) => {
  const data = resendOtpSchema.parse(req.body);
  const user = await prisma.user.findUnique({ where: { email: data.email } });
  // Don't reveal whether an email exists — respond the same way either way.
  if (user && !user.emailVerified) {
    await sendOtpEmail(user.id, user.name, user.email, "VERIFY_EMAIL");
  }
  res.json({ message: "If that account needs verification, a new code has been sent." });
});

authRouter.post("/login", async (req, res) => {
  const data = loginSchema.parse(req.body);

  const user = await prisma.user.findUnique({
    where: { email: data.email },
    include: { doctorProfile: true, patientProfile: true },
  });
  if (!user) throw new UnauthorizedError("Invalid email or password");

  const valid = await bcrypt.compare(data.password, user.passwordHash);
  if (!valid) throw new UnauthorizedError("Invalid email or password");

  if (!user.emailVerified) {
    return res.status(403).json({
      error: "EmailNotVerified",
      message: "Please verify your email before signing in.",
      email: user.email,
    });
  }

  const token = signToken({
    userId: user.id,
    role: user.role,
    doctorProfileId: user.doctorProfile?.id,
    patientProfileId: user.patientProfile?.id,
  });

  res.json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role } });
});

/** "Sign in with Google" — verifies the ID token from Google Identity Services on the
 *  frontend, then finds-or-creates a patient account. Google has already verified the
 *  email, so these accounts skip the OTP step entirely. */
authRouter.post("/google", async (req, res) => {
  if (!googleClient || !env.googleClientId) {
    throw new AppError("Google sign-in isn't configured on this server yet. Set GOOGLE_CLIENT_ID in .env.", 501);
  }
  const data = googleSignInSchema.parse(req.body);

  const ticket = await googleClient.verifyIdToken({ idToken: data.idToken, audience: env.googleClientId }).catch(() => null);
  const payload = ticket?.getPayload();
  if (!payload?.email) {
    throw new UnauthorizedError("Could not verify that Google account. Please try again.");
  }

  let user = await prisma.user.findUnique({
    where: { email: payload.email },
    include: { doctorProfile: true, patientProfile: true },
  });

  if (!user) {
    // New Google sign-ups are provisioned as patients, same as self-registration.
    const randomPassword = crypto.randomBytes(32).toString("hex");
    user = await prisma.user.create({
      data: {
        name: payload.name ?? payload.email.split("@")[0],
        email: payload.email,
        passwordHash: await bcrypt.hash(randomPassword, 10),
        role: "PATIENT",
        emailVerified: true,
        authProvider: "google",
        patientProfile: { create: {} },
      },
      include: { doctorProfile: true, patientProfile: true },
    });
  } else if (!user.emailVerified) {
    // An existing password-based account signing in with the same (now Google-verified) email.
    user = await prisma.user.update({
      where: { id: user.id },
      data: { emailVerified: true },
      include: { doctorProfile: true, patientProfile: true },
    });
  }

  const token = signToken({
    userId: user.id,
    role: user.role,
    doctorProfileId: user.doctorProfile?.id,
    patientProfileId: user.patientProfile?.id,
  });
  res.json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role } });
});

authRouter.post("/forgot-password", async (req, res) => {
  const data = forgotPasswordSchema.parse(req.body);
  const user = await prisma.user.findUnique({ where: { email: data.email } });
  // Same response regardless of whether the account exists, to avoid leaking which emails are registered.
  if (user) {
    await sendOtpEmail(user.id, user.name, user.email, "RESET_PASSWORD");
  }
  res.json({ message: "If that email is registered, a reset code has been sent." });
});

authRouter.post("/reset-password", async (req, res) => {
  const data = resetPasswordSchema.parse(req.body);
  const user = await prisma.user.findUnique({ where: { email: data.email } });
  if (!user) throw new AppError("No account found for that email", 404);

  await verifyOtp(user.id, "RESET_PASSWORD", data.code);
  const passwordHash = await bcrypt.hash(data.newPassword, 10);
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash } });

  res.json({ message: "Password updated. You can now sign in with your new password." });
});

authRouter.patch("/change-password", authenticate, async (req, res) => {
  const data = changePasswordSchema.parse(req.body);
  const user = await prisma.user.findUnique({ where: { id: req.auth!.userId } });
  if (!user) throw new AppError("User no longer exists", 404);

  const valid = await bcrypt.compare(data.currentPassword, user.passwordHash);
  if (!valid) throw new AppError("Current password is incorrect", 401);

  const passwordHash = await bcrypt.hash(data.newPassword, 10);
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash } });
  res.json({ message: "Password changed successfully." });
});

authRouter.get("/me", authenticate, async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.auth!.userId },
    include: { doctorProfile: true, patientProfile: true },
  });
  if (!user) throw new AppError("User no longer exists", 404);
  res.json({
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    role: user.role,
    authProvider: user.authProvider,
    doctorProfileId: user.doctorProfile?.id,
    patientProfileId: user.patientProfile?.id,
  });
});

/** Update basic account fields (name/phone) — available to any authenticated role. */
authRouter.patch("/me", authenticate, async (req, res) => {
  const data = updateMeSchema.parse(req.body);
  const user = await prisma.user.update({
    where: { id: req.auth!.userId },
    data: { name: data.name, phone: data.phone },
  });
  res.json({ id: user.id, name: user.name, email: user.email, phone: user.phone, role: user.role });
});
