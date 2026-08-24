import cron from "node-cron";
import { prisma } from "../config/db";
import { AppointmentStatus } from "@prisma/client";
import { emailTemplates, retryFailedEmails, sendEmail } from "../services/emailService";
import { googleCalendarUrl } from "../utils/ics";
import { startOfUtcDay } from "../utils/slots";

/** Releases HOLD appointments whose hold window expired without confirmation
 *  (e.g. the pre-visit LLM call crashed the process mid-booking), freeing the
 *  slot for other patients. Confirmed bookings are never touched. */
async function cleanupExpiredHolds() {
  const now = new Date();
  const expired = await prisma.appointment.findMany({
    where: { status: AppointmentStatus.HOLD, holdExpiresAt: { lt: now } },
  });
  for (const appt of expired) {
    await prisma.appointment.update({
      where: { id: appt.id },
      data: { status: AppointmentStatus.CANCELLED, slotLockKey: null },
    });
  }
  if (expired.length) {
    // eslint-disable-next-line no-console
    console.log(`[jobs] Released ${expired.length} expired slot hold(s).`);
  }
}

/** Sends a reminder email ~24h before each confirmed appointment, once. */
async function sendAppointmentReminders() {
  const now = new Date();
  const windowStart = new Date(now.getTime() + 23 * 60 * 60 * 1000);
  const windowEnd = new Date(now.getTime() + 25 * 60 * 60 * 1000);

  const upcoming = await prisma.appointment.findMany({
    where: { status: AppointmentStatus.CONFIRMED, slotStart: { gte: windowStart, lte: windowEnd } },
    include: { patient: { include: { user: true } }, doctor: { include: { user: true } } },
  });

  for (const appt of upcoming) {
    const already = await prisma.notificationLog.findFirst({
      where: { appointmentId: appt.id, type: "REMINDER_APPOINTMENT" },
    });
    if (already) continue;

    const whenLabel = appt.slotStart.toLocaleString("en-US", { dateStyle: "full", timeStyle: "short", timeZone: "UTC" }) + " UTC";
    const calendarUrl = googleCalendarUrl({
      title: `Appointment with Dr. ${appt.doctor.user.name}`,
      description: "ClinicAssist appointment reminder.",
      startIso: appt.slotStart.toISOString(),
      endIso: appt.slotEnd.toISOString(),
      uid: appt.id,
    });
    await sendEmail({
      to: appt.patient.user.email,
      subject: "Appointment reminder",
      html: emailTemplates.appointmentReminder(appt.patient.user.name, appt.doctor.user.name, whenLabel, calendarUrl),
      type: "REMINDER_APPOINTMENT",
      appointmentId: appt.id,
    });
  }
}

/** Sends a reminder email ~1.5h before each confirmed appointment, once — the "it's coming
 *  up soon" nudge, on top of the ~24h heads-up above. Uses a separate NotificationType so
 *  the dedup checks for the two reminders don't collide with each other. */
async function sendSoonReminders() {
  const now = new Date();
  const windowStart = new Date(now.getTime() + 1 * 60 * 60 * 1000);
  const windowEnd = new Date(now.getTime() + 2 * 60 * 60 * 1000);

  const upcoming = await prisma.appointment.findMany({
    where: { status: AppointmentStatus.CONFIRMED, slotStart: { gte: windowStart, lte: windowEnd } },
    include: { patient: { include: { user: true } }, doctor: { include: { user: true } } },
  });

  for (const appt of upcoming) {
    const already = await prisma.notificationLog.findFirst({
      where: { appointmentId: appt.id, type: "REMINDER_APPOINTMENT_SOON" },
    });
    if (already) continue;

    const whenLabel = appt.slotStart.toLocaleString("en-US", { dateStyle: "full", timeStyle: "short", timeZone: "UTC" }) + " UTC";
    const calendarUrl = googleCalendarUrl({
      title: `Appointment with Dr. ${appt.doctor.user.name}`,
      description: "ClinicAssist appointment reminder.",
      startIso: appt.slotStart.toISOString(),
      endIso: appt.slotEnd.toISOString(),
      uid: appt.id,
    });
    await sendEmail({
      to: appt.patient.user.email,
      subject: "Your appointment is coming up soon",
      html: emailTemplates.appointmentReminder(appt.patient.user.name, appt.doctor.user.name, whenLabel, calendarUrl),
      type: "REMINDER_APPOINTMENT_SOON",
      appointmentId: appt.id,
    });
  }
}

/** Sends medication reminders based on prescription frequency, deduped per calendar day. */
async function sendMedicationReminders() {
  const now = new Date();
  const today = startOfUtcDay(now);
  const currentHHMM = `${String(now.getUTCHours()).padStart(2, "0")}:${String(now.getUTCMinutes()).padStart(2, "0")}`;

  const active = await prisma.medicationReminder.findMany({
    where: { active: true, startDate: { lte: now }, endDate: { gte: now } },
    include: { appointment: { include: { patient: { include: { user: true } } } } },
  });

  for (const reminder of active) {
    const times = JSON.parse(reminder.timesOfDayJson) as string[];
    const dueNow = times.some((t) => withinFiveMinutes(t, currentHHMM));
    const alreadySentToday = reminder.lastSentDate && startOfUtcDay(reminder.lastSentDate).getTime() === today.getTime();
    if (!dueNow || alreadySentToday) continue;

    await sendEmail({
      to: reminder.appointment.patient.user.email,
      subject: `Time to take your ${reminder.medicationName}`,
      html: emailTemplates.medicationReminder(reminder.appointment.patient.user.name, reminder.medicationName, reminder.dosage),
      type: "REMINDER_MEDICATION",
      appointmentId: reminder.appointmentId,
    });

    await prisma.medicationReminder.update({ where: { id: reminder.id }, data: { lastSentDate: now } });
  }
}

function withinFiveMinutes(target: string, current: string): boolean {
  const [th, tm] = target.split(":").map(Number);
  const [ch, cm] = current.split(":").map(Number);
  return Math.abs(th * 60 + tm - (ch * 60 + cm)) <= 5;
}

/** Registers all cron schedules. Called once at server startup. */
export function startBackgroundJobs() {
  // Every 5 minutes: release stale holds and retry failed emails.
  cron.schedule("*/5 * * * *", async () => {
    await cleanupExpiredHolds().catch((e) => console.error("[jobs] cleanupExpiredHolds error:", e));
    await retryFailedEmails().catch((e) => console.error("[jobs] retryFailedEmails error:", e));
  });

  // Every 15 minutes: check for medication doses due.
  cron.schedule("*/15 * * * *", async () => {
    await sendMedicationReminders().catch((e) => console.error("[jobs] sendMedicationReminders error:", e));
  });

  // Hourly: appointment reminders (~24h out).
  cron.schedule("0 * * * *", async () => {
    await sendAppointmentReminders().catch((e) => console.error("[jobs] sendAppointmentReminders error:", e));
  });

  // Every 15 minutes: "coming up soon" reminders (~1-2h out).
  cron.schedule("*/15 * * * *", async () => {
    await sendSoonReminders().catch((e) => console.error("[jobs] sendSoonReminders error:", e));
  });

  // eslint-disable-next-line no-console
  console.log("[jobs] Background reminder/cleanup jobs scheduled.");
}

// Exported for tests / manual triggering.
export const _internal = { cleanupExpiredHolds, sendAppointmentReminders, sendSoonReminders, sendMedicationReminders };
