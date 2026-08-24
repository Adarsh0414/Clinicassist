import dotenv from "dotenv";
dotenv.config();

function required(name: string, fallback?: string): string {
  const v = process.env[name] ?? fallback;
  if (v === undefined) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return v;
}

export const env = {
  port: parseInt(process.env.PORT ?? "4000", 10),
  nodeEnv: process.env.NODE_ENV ?? "development",
  databaseUrl: required("DATABASE_URL", "file:./dev.db"),
  jwtSecret: required("JWT_SECRET", "dev-only-change-me"),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? "7d",

  // LLM (Gemini) — used for pre-visit and post-visit summaries.
  geminiApiKey: process.env.GEMINI_API_KEY ?? "",
  geminiModel: process.env.GEMINI_MODEL ?? "gemini-3.7-flash",

  // Email (SMTP via Nodemailer, or Brevo's HTTP API). If unset, the app falls
  // back to an Ethereal test account in development and logs a preview URL
  // instead of failing.
  smtpHost: process.env.SMTP_HOST ?? "",
  smtpPort: parseInt(process.env.SMTP_PORT ?? "587", 10),
  smtpUser: process.env.SMTP_USER ?? "",
  smtpPass: process.env.SMTP_PASS ?? "",
  emailFrom: process.env.EMAIL_FROM ?? "ClinicAssist <no-reply@clinicassist.example>",

  // Brevo transactional email (recommended — takes priority over SMTP if set).
  // Get a free API key at https://app.brevo.com/settings/keys/api
  brevoApiKey: process.env.BREVO_API_KEY ?? "",
  brevoSenderEmail: process.env.BREVO_SENDER_EMAIL ?? "no-reply@clinicassist.example",
  brevoSenderName: process.env.BREVO_SENDER_NAME ?? "ClinicAssist",

  // Google OAuth — used for both "Sign in with Google" (frontend Google Identity
  // Services button + backend ID-token verification) and Calendar sync.
  googleClientId: process.env.GOOGLE_CLIENT_ID ?? "",
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
  googleRedirectUri: process.env.GOOGLE_REDIRECT_URI ?? "http://localhost:4000/api/calendar/oauth/callback",

  otpExpiryMinutes: parseInt(process.env.OTP_EXPIRY_MINUTES ?? "10", 10),

  clientUrl: process.env.CLIENT_URL ?? "http://localhost:5173",

  slotHoldMinutes: parseInt(process.env.SLOT_HOLD_MINUTES ?? "5", 10),
};
