import nodemailer, { Transporter } from "nodemailer";
import { env } from "../config/env";
import { prisma } from "../config/db";
import { NotificationType } from "@prisma/client";

let transporterPromise: Promise<Transporter> | null = null;

/**
 * Lazily builds an SMTP transporter (used when Brevo's HTTP API isn't
 * configured). Real SMTP credentials (SendGrid, Mailgun, Brevo's own SMTP
 * relay, etc.) all work here. If nothing is configured, falls back to a free
 * Ethereal test inbox in development so the app runs out of the box.
 */
function getTransporter(): Promise<Transporter> {
  if (transporterPromise) return transporterPromise;

  transporterPromise = (async () => {
    if (env.smtpHost && env.smtpUser && env.smtpPass) {
      return nodemailer.createTransport({
        host: env.smtpHost,
        port: env.smtpPort,
        secure: env.smtpPort === 465,
        auth: { user: env.smtpUser, pass: env.smtpPass },
      });
    }
    const testAccount = await nodemailer.createTestAccount();
    // eslint-disable-next-line no-console
    console.warn(
      "[email] No BREVO_API_KEY or SMTP_HOST configured — using an Ethereal test inbox. " +
        "Set BREVO_API_KEY (recommended) or SMTP_HOST/SMTP_USER/SMTP_PASS in .env for real delivery."
    );
    return nodemailer.createTransport({
      host: testAccount.smtp.host,
      port: testAccount.smtp.port,
      secure: testAccount.smtp.secure,
      auth: { user: testAccount.user, pass: testAccount.pass },
    });
  })();

  return transporterPromise;
}

/** Sends via Brevo's transactional email HTTP API. Used for every email in this
 *  app — OTP codes included — whenever BREVO_API_KEY is configured. */
async function sendViaBrevo(to: string, subject: string, html: string, attachments?: EmailAttachment[]): Promise<void> {
  const res = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json", "api-key": env.brevoApiKey },
    body: JSON.stringify({
      sender: { name: env.brevoSenderName, email: env.brevoSenderEmail },
      to: [{ email: to }],
      subject,
      htmlContent: html,
      attachment: attachments?.map((a) => ({ name: a.filename, content: Buffer.from(a.content).toString("base64") })),
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Brevo API returned ${res.status}: ${body.slice(0, 300)}`);
  }
}

export interface EmailAttachment {
  filename: string;
  content: string; // raw text content (e.g. ICS text) — base64-encoded internally as needed per provider
  contentType: string;
}

export interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
  type: NotificationType;
  appointmentId?: string;
  attachments?: EmailAttachment[];
}

/**
 * Sends an email and always writes a NotificationLog row, whether it
 * succeeds or fails. Failures never throw up into the caller (booking,
 * cancellation, etc. must still succeed even if email is down) — instead
 * they're logged with status FAILED so the reminder/retry job can pick
 * them back up.
 */
export async function sendEmail(input: SendEmailInput): Promise<void> {
  try {
    if (env.brevoApiKey) {
      await sendViaBrevo(input.to, input.subject, input.html, input.attachments);
    } else {
      const transporter = await getTransporter();
      const info = await transporter.sendMail({
        from: env.emailFrom,
        to: input.to,
        subject: input.subject,
        html: input.html,
        attachments: input.attachments?.map((a) => ({ filename: a.filename, content: a.content, contentType: a.contentType })),
      });
      const preview = nodemailer.getTestMessageUrl(info);
      if (preview) {
        // eslint-disable-next-line no-console
        console.log(`[email] Preview: ${preview}`);
      }
    }

    await prisma.notificationLog.create({
      data: { appointmentId: input.appointmentId, type: input.type, recipientEmail: input.to, subject: input.subject, status: "SENT" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown email error";
    // eslint-disable-next-line no-console
    console.error(`[email] Failed to send "${input.subject}" to ${input.to}: ${message}`);
    await prisma.notificationLog.create({
      data: {
        appointmentId: input.appointmentId,
        type: input.type,
        recipientEmail: input.to,
        subject: input.subject,
        status: "FAILED",
        lastError: message,
      },
    });
  }
}

/** Retries every FAILED notification from the last 24h. Used by the background job. */
export async function retryFailedEmails(): Promise<{ retried: number; stillFailed: number }> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const failed = await prisma.notificationLog.findMany({
    where: { status: "FAILED", createdAt: { gte: since }, attempts: { lt: 5 } },
  });

  let stillFailed = 0;
  for (const log of failed) {
    try {
      if (env.brevoApiKey) {
        await sendViaBrevo(log.recipientEmail, log.subject, `<p>${log.subject}</p>`);
      } else {
        const transporter = await getTransporter();
        await transporter.sendMail({ from: env.emailFrom, to: log.recipientEmail, subject: log.subject, html: `<p>${log.subject}</p>` });
      }
      await prisma.notificationLog.update({ where: { id: log.id }, data: { status: "SENT", attempts: { increment: 1 } } });
    } catch (err) {
      stillFailed += 1;
      await prisma.notificationLog.update({
        where: { id: log.id },
        data: { status: "RETRYING", attempts: { increment: 1 }, lastError: err instanceof Error ? err.message : "Unknown error" },
      });
    }
  }
  return { retried: failed.length - stillFailed, stillFailed };
}

/** Shared HTML shell so every ClinicAssist email (including OTP codes) looks consistent. */
function emailShell(bodyHtml: string): string {
  return `
  <div style="font-family: 'IBM Plex Sans', Arial, sans-serif; background: #F6F8F7; padding: 32px 16px;">
    <div style="max-width: 480px; margin: 0 auto; background: #ffffff; border-radius: 16px; overflow: hidden; border: 1px solid #DCE3E0;">
      <div style="background: linear-gradient(135deg, #2F6E62, #1B4941); padding: 24px 28px;">
        <span style="color: #ffffff; font-family: Georgia, serif; font-size: 20px; font-weight: 600;">ClinicAssist</span>
        <div style="color: rgba(255,255,255,0.75); font-size: 11px; margin-top: 2px;">Smart Healthcare Appointment &amp; Follow-up Management</div>
      </div>
      <div style="padding: 28px; color: #1E2A28;">
        ${bodyHtml}
      </div>
    </div>
  </div>`;
}

/** A styled "Add to Calendar" button used in confirmation/reschedule emails. The .ics
 *  file is attached separately (covers Apple Calendar/Outlook/etc.); this link covers the
 *  one-click Google Calendar case, directly from the inbox. */
function addToCalendarButton(googleCalendarUrl: string): string {
  return `
    <div style="text-align:center; margin: 20px 0;">
      <a href="${googleCalendarUrl}" style="display:inline-block; background:#2F6E62; color:#ffffff; text-decoration:none; font-weight:600; font-size:14px; padding:10px 20px; border-radius:8px;">
        + Add to Google Calendar
      </a>
      <p style="font-size:11px; color:#6b7a77; margin-top:8px;">A calendar file (.ics) is also attached to this email — it works with Apple Calendar, Outlook, and most other calendar apps.</p>
    </div>`;
}

export const emailTemplates = {
  bookingConfirmationPatient: (input: {
    patientName: string;
    doctorName: string;
    specialization: string;
    when: string;
    tokenNumber?: number;
    googleCalendarUrl?: string;
  }) =>
    emailShell(`
    <h2 style="margin-top:0;">✅ Your appointment is confirmed</h2>
    <p>Hi ${input.patientName},</p>
    <p>Great news — your appointment has been successfully booked. Here are your visit details:</p>
    <table style="width:100%; border-collapse: collapse; margin: 16px 0;">
      <tr><td style="padding:6px 0; color:#6b7a77; font-size:13px;">Doctor</td><td style="padding:6px 0; font-weight:600;">Dr. ${input.doctorName}</td></tr>
      <tr><td style="padding:6px 0; color:#6b7a77; font-size:13px;">Specialization</td><td style="padding:6px 0;">${input.specialization}</td></tr>
      <tr><td style="padding:6px 0; color:#6b7a77; font-size:13px;">Date &amp; time</td><td style="padding:6px 0; font-weight:600;">${input.when}</td></tr>
      ${
        input.tokenNumber
          ? `<tr><td style="padding:6px 0; color:#6b7a77; font-size:13px;">Token number</td><td style="padding:6px 0;"><span style="font-family:'IBM Plex Mono',monospace; font-weight:700; background:#E4EFEC; color:#204E45; padding:2px 10px; border-radius:999px;">#${input.tokenNumber}</span></td></tr>`
          : ""
      }
    </table>
    ${input.googleCalendarUrl ? addToCalendarButton(input.googleCalendarUrl) : ""}
    <p>We'll send you a reminder before your visit, and you can view, reschedule, or cancel this booking any time from your patient portal.</p>
  `),
  bookingNotificationDoctor: (doctorName: string, patientName: string, when: string) =>
    emailShell(`
    <h2 style="margin-top:0;">New appointment booked</h2>
    <p>Hi Dr. ${doctorName},</p>
    <p>${patientName} has booked an appointment with you for <strong>${when}</strong>. A pre-visit summary will be available before the visit.</p>
  `),
  cancellation: (name: string, when: string, doctorName: string) =>
    emailShell(`
    <h2 style="margin-top:0;">Appointment cancelled</h2>
    <p>Hi ${name},</p>
    <p>Your appointment with <strong>Dr. ${doctorName}</strong> scheduled for <strong>${when}</strong> has been cancelled and the slot has been released.</p>
    <p>If this was a mistake, you're welcome to book a new time any time from your patient portal.</p>
  `),
  rescheduleNeeded: (patientName: string, doctorName: string, when: string) =>
    emailShell(`
    <h2 style="margin-top:0;">Your doctor is unavailable — please rebook</h2>
    <p>Hi ${patientName},</p>
    <p>Dr. ${doctorName} is now on leave on <strong>${when}</strong> and cannot see you as planned. We're sorry for the
    inconvenience — please log in to rebook a new slot at your convenience.</p>
  `),
  rescheduled: (patientName: string, doctorName: string, when: string, tokenNumber?: number, googleCalendarUrl?: string) =>
    emailShell(`
    <h2 style="margin-top:0;">Your appointment has a new time</h2>
    <p>Hi ${patientName},</p>
    <p>Your appointment with <strong>Dr. ${doctorName}</strong> has been rescheduled to <strong>${when}</strong>.</p>
    ${
      tokenNumber
        ? `<p>Your new token number is <span style="font-family:'IBM Plex Mono',monospace; font-weight:700; background:#E4EFEC; color:#204E45; padding:2px 10px; border-radius:999px;">#${tokenNumber}</span></p>`
        : ""
    }
    ${googleCalendarUrl ? addToCalendarButton(googleCalendarUrl) : ""}
    <p>No action needed — this is just a heads up. You can view or manage this booking any time from your patient portal.</p>
  `),
  appointmentReminder: (patientName: string, doctorName: string, when: string, googleCalendarUrl?: string) =>
    emailShell(`
    <h2 style="margin-top:0;">Appointment reminder</h2>
    <p>Hi ${patientName}, this is a reminder that you have an appointment with Dr. ${doctorName} on <strong>${when}</strong>.</p>
    ${googleCalendarUrl ? addToCalendarButton(googleCalendarUrl) : ""}
  `),
  medicationReminder: (patientName: string, medicationName: string, dosage: string) =>
    emailShell(`
    <h2 style="margin-top:0;">Medication reminder</h2>
    <p>Hi ${patientName}, it's time to take your <strong>${medicationName}</strong> (${dosage}).</p>
  `),
  visitCompleted: (patientName: string, doctorName: string, hasPrescription: boolean, followUpAfterDays: number | null) =>
    emailShell(`
    <h2 style="margin-top:0;">Dr. ${doctorName} has responded to your visit</h2>
    <p>Hi ${patientName},</p>
    <p>Your doctor has reviewed your appointment and left ${hasPrescription ? "a prescription and " : ""}a summary for you.</p>
    <p>For your privacy, we don't include medical details in this email — please log in to your patient portal to view
    the full summary${hasPrescription ? " and prescription" : ""}.</p>
    ${
      followUpAfterDays
        ? `<p style="background:#FBF0DE; color:#8a5f1f; padding:10px 14px; border-radius:8px; font-size:14px;">Your doctor has recommended a follow-up consultation in approximately <strong>${followUpAfterDays} day${followUpAfterDays === 1 ? "" : "s"}</strong>.</p>`
        : ""
    }
  `),
  otpCode: (name: string, code: string, purpose: "VERIFY_EMAIL" | "RESET_PASSWORD", expiryMinutes: number) =>
    emailShell(`
    <h2 style="margin-top:0;">${purpose === "VERIFY_EMAIL" ? "Verify your email" : "Reset your password"}</h2>
    <p>Hi ${name},</p>
    <p>${
      purpose === "VERIFY_EMAIL"
        ? "Welcome to ClinicAssist! Use the code below to verify your email address and finish creating your account."
        : "Use the code below to reset your ClinicAssist password."
    }</p>
    <div style="text-align:center; margin: 24px 0;">
      <span style="display:inline-block; letter-spacing: 6px; font-size: 32px; font-weight: 700; font-family: 'IBM Plex Mono', monospace; background:#E4EFEC; color:#204E45; padding: 12px 24px; border-radius: 10px;">${code}</span>
    </div>
    <p style="font-size: 13px; color: #6b7a77;">This code is valid for ${expiryMinutes} minutes. If you didn't request this, you can safely ignore this email — no changes have been made to your account.</p>
  `),
};
