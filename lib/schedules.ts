export type PeriodKind = "class" | "break" | "passing" | "bell";

export interface Period {
  name: string;
  start: string;
  end: string;
  kind: PeriodKind;
}

export type PresetId =
  | "monday"
  | "tuesday"
  | "wednesday"
  | "thursday"
  | "friday"
  | "minimum"
  | "assembly"
  | "weekend";

export interface DaySchedule {
  id: string;
  label: string;
  short: string;
  note?: string;
  periods: Period[];
}

const p = (name: string, start: string, end: string, kind: PeriodKind = "class"): Period => ({
  name,
  start,
  end,
  kind,
});

export const PRESETS: Record<Exclude<PresetId, "weekend">, DaySchedule> = {
  monday: {
    id: "monday",
    label: "Monday",
    short: "Mon",
    note: "Regular day · announcements in 3rd block",
    periods: [
      p("Warning Bell", "08:25", "08:30", "bell"),
      p("Period 1", "08:30", "09:16"),
      p("Period 2", "09:19", "10:05"),
      p("Period 3 + Announcements", "10:08", "10:57"),
      p("Brunch", "10:57", "11:11", "break"),
      p("Period 4", "11:14", "12:00"),
      p("Period 5", "12:03", "12:49"),
      p("Lunch", "12:49", "13:25", "break"),
      p("Period 6", "13:28", "14:14"),
      p("Period 7", "14:17", "15:03"),
    ],
  },
  tuesday: {
    id: "tuesday",
    label: "Tuesday",
    short: "Tue",
    note: "Tutorial / Advisory after brunch",
    periods: [
      p("Warning Bell", "08:25", "08:30", "bell"),
      p("Period 1", "08:30", "09:12"),
      p("Period 2", "09:15", "09:57"),
      p("Period 3", "10:00", "10:42"),
      p("Brunch", "10:42", "10:56", "break"),
      p("Tutorial / Advisory", "10:59", "11:27"),
      p("Period 4", "11:30", "12:12"),
      p("Period 5", "12:15", "12:57"),
      p("Lunch", "12:57", "13:33", "break"),
      p("Period 6", "13:36", "14:18"),
      p("Period 7", "14:21", "15:03"),
    ],
  },
  wednesday: {
    id: "wednesday",
    label: "Wednesday",
    short: "Wed",
    note: "Late start · even block (2 / 4 / 6)",
    periods: [
      p("Warning Bell", "09:12", "09:17", "bell"),
      p("Period 2", "09:17", "10:39"),
      p("Brunch", "10:39", "10:53", "break"),
      p("Period 4", "10:56", "12:18"),
      p("Lunch", "12:18", "12:54", "break"),
      p("Period 6", "12:57", "14:19"),
      p("Tutorial + Announcements", "14:22", "15:03"),
    ],
  },
  thursday: {
    id: "thursday",
    label: "Thursday",
    short: "Thu",
    note: "Odd block (1 / 3 / 5 / 7)",
    periods: [
      p("Warning Bell", "08:25", "08:30", "bell"),
      p("Period 1", "08:30", "09:52"),
      p("Passing", "09:52", "09:58", "passing"),
      p("Period 3", "10:01", "11:23"),
      p("Brunch", "11:23", "11:37", "break"),
      p("Period 5", "11:40", "13:02"),
      p("Lunch", "13:02", "13:38", "break"),
      p("Period 7", "13:41", "15:03"),
    ],
  },
  friday: {
    id: "friday",
    label: "Friday",
    short: "Fri",
    note: "Same bell times as Tuesday",
    periods: [
      p("Warning Bell", "08:25", "08:30", "bell"),
      p("Period 1", "08:30", "09:12"),
      p("Period 2", "09:15", "09:57"),
      p("Period 3", "10:00", "10:42"),
      p("Brunch", "10:42", "10:56", "break"),
      p("Tutorial / Advisory", "10:59", "11:27"),
      p("Period 4", "11:30", "12:12"),
      p("Period 5", "12:15", "12:57"),
      p("Lunch", "12:57", "13:33", "break"),
      p("Period 6", "13:36", "14:18"),
      p("Period 7", "14:21", "15:03"),
    ],
  },
  minimum: {
    id: "minimum",
    label: "Minimum Day",
    short: "Min",
    note: "Dismissal 12:30 · all 7 periods",
    periods: [
      p("Period 1", "08:30", "09:00"),
      p("Period 2", "09:03", "09:33"),
      p("Period 3", "09:36", "10:06"),
      p("Period 4", "10:09", "10:39"),
      p("Brunch", "10:39", "10:51", "break"),
      p("Period 5", "10:54", "11:24"),
      p("Period 6", "11:27", "11:57"),
      p("Period 7", "12:00", "12:30"),
    ],
  },
  assembly: {
    id: "assembly",
    label: "Assembly",
    short: "Asm",
    note: "A–H rotation for assemblies",
    periods: [
      p("A", "08:30", "09:10"),
      p("B", "09:13", "09:53"),
      p("C", "09:56", "10:37"),
      p("Brunch", "10:37", "10:51", "break"),
      p("D", "10:54", "11:34"),
      p("E", "11:37", "12:17"),
      p("Lunch", "12:17", "12:54", "break"),
      p("F", "12:57", "13:37"),
      p("G", "13:40", "14:20"),
      p("H", "14:23", "15:03"),
    ],
  },
};

export const WEEKEND: DaySchedule = {
  id: "weekend",
  label: "Weekend",
  short: "Off",
  note: "No school",
  periods: [],
};

export const WEEKDAY_PRESET: Record<number, PresetId> = {
  0: "weekend",
  1: "monday",
  2: "tuesday",
  3: "wednesday",
  4: "thursday",
  5: "friday",
  6: "weekend",
};

export function getPreset(id: PresetId): DaySchedule {
  if (id === "weekend") return WEEKEND;
  return PRESETS[id];
}

export function withPassing(periods: Period[]): Period[] {
  const out: Period[] = [];
  for (let i = 0; i < periods.length; i++) {
    const cur = periods[i];
    out.push(cur);
    const next = periods[i + 1];
    if (!next) continue;
    if (timeToMinutes(next.start) > timeToMinutes(cur.end)) {
      const alreadyPassing = cur.kind === "passing" || next.kind === "passing";
      if (!alreadyPassing) {
        out.push({
          name: "Passing",
          start: cur.end,
          end: next.start,
          kind: "passing",
        });
      }
    }
  }
  return out;
}

export function timeToMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

export function timeToMs(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return (h * 60 + m) * 60_000;
}

export function formatTime12h(time24: string): string {
  const [hourStr, minute] = time24.split(":");
  let hour = parseInt(hourStr, 10);
  const ampm = hour >= 12 ? "PM" : "AM";
  hour = hour % 12;
  if (hour === 0) hour = 12;
  return `${hour}:${minute} ${ampm}`;
}

export function periodDurationMin(period: Period): number {
  return timeToMinutes(period.end) - timeToMinutes(period.start);
}

export function isAlertable(period: Period): boolean {
  return period.kind === "class";
}

export function dateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function parseDateKey(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function weekdayLabel(d: Date): string {
  return d.toLocaleDateString("en-US", { weekday: "long" });
}

export function prettyDate(d: Date): string {
  return d.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}
