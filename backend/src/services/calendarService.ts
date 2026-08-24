import { google } from "googleapis";
import { env } from "../config/env";

/**
 * Google Calendar integration.
 *
 * Auth model: each User (patient or doctor) who wants calendar sync connects
 * their own Google account once via OAuth2 (see routes/calendar.ts), and we
 * store their refresh token (in a real deployment: encrypted at rest — see
 * README "Security notes"). We then create/update/delete events on their
 * calendar on booking/reschedule/cancellation.
 *
 * This module never throws out of its public functions — calendar sync is a
 * nice-to-have alongside email, not a booking blocker, so failures are caught
 * and logged by the caller (see appointmentService) exactly like LLM/email.
 */

export function getOAuthClient() {
  return new google.auth.OAuth2(env.googleClientId, env.googleClientSecret, env.googleRedirectUri);
}

export function getAuthUrl(state: string): string {
  const client = getOAuthClient();
  return client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: ["https://www.googleapis.com/auth/calendar.events"],
    state,
  });
}

export async function exchangeCodeForTokens(code: string) {
  const client = getOAuthClient();
  const { tokens } = await client.getToken(code);
  return tokens; // { access_token, refresh_token, expiry_date, ... }
}

interface EventInput {
  refreshToken: string;
  summary: string;
  description: string;
  startIso: string;
  endIso: string;
  attendeeEmails?: string[];
}

function clientFor(refreshToken: string) {
  const client = getOAuthClient();
  client.setCredentials({ refresh_token: refreshToken });
  return google.calendar({ version: "v3", auth: client });
}

export async function createCalendarEvent(input: EventInput): Promise<string | null> {
  try {
    const calendar = clientFor(input.refreshToken);
    const { data } = await calendar.events.insert({
      calendarId: "primary",
      requestBody: {
        summary: input.summary,
        description: input.description,
        start: { dateTime: input.startIso },
        end: { dateTime: input.endIso },
        attendees: input.attendeeEmails?.map((email) => ({ email })),
      },
    });
    return data.id ?? null;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[calendar] createCalendarEvent failed:", err instanceof Error ? err.message : err);
    return null;
  }
}

export async function updateCalendarEvent(
  refreshToken: string,
  eventId: string,
  patch: Partial<Pick<EventInput, "startIso" | "endIso" | "summary" | "description">>
): Promise<boolean> {
  try {
    const calendar = clientFor(refreshToken);
    await calendar.events.patch({
      calendarId: "primary",
      eventId,
      requestBody: {
        summary: patch.summary,
        description: patch.description,
        start: patch.startIso ? { dateTime: patch.startIso } : undefined,
        end: patch.endIso ? { dateTime: patch.endIso } : undefined,
      },
    });
    return true;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[calendar] updateCalendarEvent failed:", err instanceof Error ? err.message : err);
    return false;
  }
}

export async function deleteCalendarEvent(refreshToken: string, eventId: string): Promise<boolean> {
  try {
    const calendar = clientFor(refreshToken);
    await calendar.events.delete({ calendarId: "primary", eventId });
    return true;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[calendar] deleteCalendarEvent failed:", err instanceof Error ? err.message : err);
    return false;
  }
}
