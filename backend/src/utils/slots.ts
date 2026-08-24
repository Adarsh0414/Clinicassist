export interface WorkingHours {
  [weekday: string]: { start: string; end: string } | undefined; // "MON" -> {start:"09:00",end:"17:00"}
}

const WEEKDAY_KEYS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

/** Generates candidate slot start times (as Date objects, UTC) for one calendar day. */
export function generateDaySlots(dateOnly: Date, workingHours: WorkingHours, slotDurationMinutes: number): Date[] {
  const weekday = WEEKDAY_KEYS[dateOnly.getUTCDay()];
  const hours = workingHours[weekday];
  if (!hours) return [];

  const [startH, startM] = hours.start.split(":").map(Number);
  const [endH, endM] = hours.end.split(":").map(Number);

  const dayStart = new Date(Date.UTC(dateOnly.getUTCFullYear(), dateOnly.getUTCMonth(), dateOnly.getUTCDate(), startH, startM));
  const dayEnd = new Date(Date.UTC(dateOnly.getUTCFullYear(), dateOnly.getUTCMonth(), dateOnly.getUTCDate(), endH, endM));

  const slots: Date[] = [];
  let cursor = new Date(dayStart);
  while (cursor.getTime() + slotDurationMinutes * 60000 <= dayEnd.getTime()) {
    slots.push(new Date(cursor));
    cursor = new Date(cursor.getTime() + slotDurationMinutes * 60000);
  }
  return slots;
}

export function slotLockKey(doctorId: string, slotStart: Date): string {
  return `${doctorId}_${slotStart.toISOString()}`;
}

export function startOfUtcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}
