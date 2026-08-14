import {
  Period,
  DaySchedule,
  timeToMs,
  timeToMinutes,
} from "./schedules";

export function nowMsOfDay(now: Date): number {
  return (
    now.getHours() * 3_600_000 +
    now.getMinutes() * 60_000 +
    now.getSeconds() * 1_000 +
    now.getMilliseconds()
  );
}

export function formatClock(now: Date): string {
  return now.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  });
}

export function formatRemaining(ms: number): string {
  if (ms < 0) ms = 0;
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function formatCompact(ms: number): string {
  if (ms < 0) ms = 0;
  const totalMin = Math.round(ms / 60_000);
  if (totalMin < 1) return "<1m";
  if (totalMin < 60) return `${totalMin}m`;
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

export type PeriodStatus = "done" | "current" | "upcoming";

export interface PeriodState {
  period: Period;
  status: PeriodStatus;
  remainingMs: number;
  elapsedMs: number;
  durationMs: number;
  progress: number;
}

export function getPeriodStates(periods: Period[], now: Date): PeriodState[] {
  const t = nowMsOfDay(now);
  return periods.map((period) => {
    const start = timeToMs(period.start);
    const end = timeToMs(period.end);
    const durationMs = Math.max(end - start, 1);
    if (t < start) {
      return {
        period,
        status: "upcoming" as const,
        remainingMs: end - t,
        elapsedMs: 0,
        durationMs,
        progress: 0,
      };
    }
    if (t >= end) {
      return {
        period,
        status: "done" as const,
        remainingMs: 0,
        elapsedMs: durationMs,
        durationMs,
        progress: 1,
      };
    }
    const elapsedMs = t - start;
    return {
      period,
      status: "current" as const,
      remainingMs: end - t,
      elapsedMs,
      durationMs,
      progress: elapsedMs / durationMs,
    };
  });
}

export function schoolWindow(schedule: DaySchedule): { start: number; end: number } | null {
  if (!schedule.periods.length) return null;
  const first = schedule.periods[0];
  const last = schedule.periods[schedule.periods.length - 1];
  return { start: timeToMinutes(first.start), end: timeToMinutes(last.end) };
}

export type DayPhase = "weekend" | "before" | "during" | "after";

export function getDayPhase(schedule: DaySchedule, now: Date): DayPhase {
  if (!schedule.periods.length) return "weekend";
  const win = schoolWindow(schedule);
  if (!win) return "weekend";
  const mins = now.getHours() * 60 + now.getMinutes() + now.getSeconds() / 60;
  if (mins < win.start) return "before";
  if (mins >= win.end) return "after";
  return "during";
}

export function currentState(states: PeriodState[]): PeriodState | undefined {
  return states.find((s) => s.status === "current");
}
