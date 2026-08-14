import { DaySchedule, Period, dateKey, isAlertable, parseDateKey } from "./schedules";

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function stamp(d: Date): string {
  return (
    `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}` +
    `T${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
  );
}

function atTime(day: Date, hhmm: string): Date {
  const [h, m] = hhmm.split(":").map(Number);
  return new Date(day.getFullYear(), day.getMonth(), day.getDate(), h, m, 0);
}

function escapeText(s: string) {
  return s.replace(/\\/g, "\\\\").replace(/,/g, "\\,").replace(/;/g, "\\;").replace(/\n/g, "\\n");
}

function eventForPeriod(day: Date, period: Period, alertMinutes: number, rrule?: string) {
  const start = atTime(day, period.start);
  const end = atTime(day, period.end);
  const uid = `${dateKey(day)}-${period.name.replace(/\s+/g, "")}-${period.end}@eganbells`;
  return [
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${stamp(new Date())}`,
    `DTSTART:${stamp(start)}`,
    `DTEND:${stamp(end)}`,
    `SUMMARY:${escapeText(`${period.name} · Egan`)}`,
    rrule ? `RRULE:${rrule}` : "",
    "BEGIN:VALARM",
    `TRIGGER:-PT${alertMinutes}M`,
    "ACTION:DISPLAY",
    `DESCRIPTION:${escapeText(`${period.name} ends in ${alertMinutes} minutes`)}`,
    "END:VALARM",
    "END:VEVENT",
  ]
    .filter(Boolean)
    .join("\r\n");
}

export function buildDayIcs(day: Date, schedule: DaySchedule, alertMinutes: number): string {
  const events = schedule.periods
    .filter(isAlertable)
    .map((p) => eventForPeriod(day, p, alertMinutes));
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Egan Bells//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:Egan Bells · ${schedule.label}`,
    ...events,
    "END:VCALENDAR",
  ].join("\r\n");
}

export function buildWeeklyIcs(
  schedules: { byDay: string; schedule: DaySchedule }[],
  alertMinutes: number
): string {
  const monday = startOfWeek(new Date());
  const events: string[] = [];
  for (const { byDay, schedule } of schedules) {
    const offset = { MO: 0, TU: 1, WE: 2, TH: 3, FR: 4 }[byDay] ?? 0;
    const day = new Date(monday);
    day.setDate(monday.getDate() + offset);
    for (const period of schedule.periods.filter(isAlertable)) {
      events.push(eventForPeriod(day, period, alertMinutes, `FREQ=WEEKLY;BYDAY=${byDay}`));
    }
  }
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Egan Bells//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:Egan Bells · Weekly",
    ...events,
    "END:VCALENDAR",
  ].join("\r\n");
}

function startOfWeek(d: Date): Date {
  const copy = new Date(d);
  const day = copy.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  copy.setDate(copy.getDate() + diff);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

export function downloadIcs(filename: string, ics: string) {
  const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function nextMondayKey(): string {
  return dateKey(startOfWeek(new Date()));
}

export function dateFromKey(key: string): Date {
  return parseDateKey(key);
}
