export interface WorkingHours {
  [day: string]: { start: string; end: string } | undefined;
}

const WEEKDAY_ORDER = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];
const WEEKDAY_LABEL: Record<string, string> = {
  MON: "Mon",
  TUE: "Tue",
  WED: "Wed",
  THU: "Thu",
  FRI: "Fri",
  SAT: "Sat",
  SUN: "Sun",
};
const TODAY_KEY = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

function to12h(time: string): string {
  const [h, m] = time.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return m === 0 ? `${hour12}${period}` : `${hour12}:${String(m).padStart(2, "0")}${period}`;
}

/** Groups consecutive days sharing identical hours into ranges, e.g.
 *  { MON:9-5, TUE:9-5, ... FRI:9-5 } -> "Mon–Fri · 9AM–5PM". */
export function summarizeWorkingHours(hours: WorkingHours): string {
  const active = WEEKDAY_ORDER.filter((d) => hours[d]);
  if (active.length === 0) return "No hours set";

  const groups: Array<{ days: string[]; start: string; end: string }> = [];
  for (const day of WEEKDAY_ORDER) {
    const h = hours[day];
    if (!h) continue;
    const last = groups[groups.length - 1];
    const lastDayIndex = last ? WEEKDAY_ORDER.indexOf(last.days[last.days.length - 1]) : -2;
    if (last && last.start === h.start && last.end === h.end && WEEKDAY_ORDER.indexOf(day) === lastDayIndex + 1) {
      last.days.push(day);
    } else {
      groups.push({ days: [day], start: h.start, end: h.end });
    }
  }

  return groups
    .map((g) => {
      const dayLabel =
        g.days.length > 1 ? `${WEEKDAY_LABEL[g.days[0]]}–${WEEKDAY_LABEL[g.days[g.days.length - 1]]}` : WEEKDAY_LABEL[g.days[0]];
      return `${dayLabel} · ${to12h(g.start)}–${to12h(g.end)}`;
    })
    .join(", ");
}

/** Whether the doctor's standard weekly hours cover *right now* (UTC).
 *  Doesn't account for one-off leave days — the slot picker is the source of
 *  truth for that; this is a quick at-a-glance signal on the doctor list. */
export function isAvailableNow(hours: WorkingHours): boolean {
  const now = new Date();
  const dayKey = TODAY_KEY[now.getUTCDay()];
  const today = hours[dayKey];
  if (!today) return false;
  const currentMinutes = now.getUTCHours() * 60 + now.getUTCMinutes();
  const [startH, startM] = today.start.split(":").map(Number);
  const [endH, endM] = today.end.split(":").map(Number);
  return currentMinutes >= startH * 60 + startM && currentMinutes < endH * 60 + endM;
}

export function worksToday(hours: WorkingHours): boolean {
  const dayKey = TODAY_KEY[new Date().getUTCDay()];
  return !!hours[dayKey];
}
