interface CalendarEventInput {
  title: string;
  description: string;
  startIso: string; // ISO datetime, UTC
  endIso: string; // ISO datetime, UTC
  uid: string;
}

function toIcsDate(iso: string): string {
  // ICS wants "YYYYMMDDTHHMMSSZ" in UTC.
  return iso.replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

function escapeIcsText(text: string): string {
  return text.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");
}

/** Builds a standard .ics file — opens natively in Google Calendar, Outlook, Apple
 *  Calendar, Yahoo, or any other calendar app that supports the iCalendar format
 *  (RFC 5545), which is effectively all of them. This is the "works everywhere"
 *  option; downloadIcsFile() triggers a save/open of this file. */
export function buildIcsContent(event: CalendarEventInput): string {
  const now = toIcsDate(new Date().toISOString());
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//ClinicAssist//Appointment//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${event.uid}@clinicassist`,
    `DTSTAMP:${now}`,
    `DTSTART:${toIcsDate(event.startIso)}`,
    `DTEND:${toIcsDate(event.endIso)}`,
    `SUMMARY:${escapeIcsText(event.title)}`,
    `DESCRIPTION:${escapeIcsText(event.description)}`,
    "BEGIN:VALARM",
    "TRIGGER:-PT30M",
    "ACTION:DISPLAY",
    "DESCRIPTION:Reminder",
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
}

/** Triggers a browser download of the .ics file — double-clicking it opens
 *  whichever calendar app is set as the system default. */
export function downloadIcsFile(event: CalendarEventInput, filename = "appointment.ics") {
  const content = buildIcsContent(event);
  const blob = new Blob([content], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/** One-click "Add to Google Calendar" — opens calendar.google.com pre-filled,
 *  no download needed. Offered alongside the .ics option since it's the most
 *  common single calendar provider and skips a step for those users. */
export function googleCalendarUrl(event: CalendarEventInput): string {
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: event.title,
    dates: `${toIcsDate(event.startIso)}/${toIcsDate(event.endIso)}`,
    details: event.description,
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}
