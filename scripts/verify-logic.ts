import { PRESETS, WEEKDAY_PRESET, getPreset, withPassing, isAlertable } from "../lib/schedules";
import { getPeriodStates, currentState } from "../lib/time";
import { buildDayIcs, buildWeeklyIcs } from "../lib/ics";
import { maybeFireAlert } from "../lib/notify";
import { DEFAULT_SETTINGS } from "../lib/storage";

function at(h: number, m: number, s = 0) {
  return new Date(2026, 7, 14, h, m, s);
}

let failed = 0;
function assert(cond: boolean, msg: string) {
  if (!cond) {
    failed += 1;
    console.error("FAIL", msg);
  } else {
    console.log("ok  ", msg);
  }
}

assert(WEEKDAY_PRESET[5] === "friday", "Friday maps to friday preset");
assert(WEEKDAY_PRESET[1] === "monday", "Monday maps to monday preset");
assert(WEEKDAY_PRESET[3] === "wednesday", "Wednesday maps to wednesday preset");
assert(PRESETS.friday.periods.some((p) => p.name === "Period 3" && p.start === "10:00" && p.end === "10:42"), "Friday P3 10:00–10:42");
assert(PRESETS.wednesday.periods[1].name === "Period 2", "Wednesday starts with period 2");
assert(PRESETS.thursday.periods.some((p) => p.name === "Period 7"), "Thursday has period 7");
assert(PRESETS.minimum.periods.at(-1)?.end === "12:30", "Minimum day dismisses 12:30");

const fri = withPassing(PRESETS.friday.periods);
const states = getPeriodStates(fri, at(10, 29, 0));
const cur = currentState(states);
assert(cur?.period.name === "Period 3", `10:29 is Period 3, got ${cur?.period.name}`);
assert(Math.abs(cur!.remainingMs - 13 * 60_000) < 1000, `~13 min left at 10:29, got ${cur!.remainingMs}`);

const brunch = states.find((s) => s.period.name === "Brunch");
assert(brunch?.status === "upcoming", "Brunch still upcoming at 10:29");

const settings = { ...DEFAULT_SETTINGS, enabled: true, minutes: 5 };
assert(
  maybeFireAlert("2026-08-14", PRESETS.friday.periods.find((p) => p.name === "Period 3")!, 4 * 60_000, settings),
  "Fires when under 5 minutes left"
);
assert(
  !maybeFireAlert("2026-08-14", PRESETS.friday.periods.find((p) => p.name === "Period 3")!, 4 * 60_000, settings),
  "Does not fire twice"
);
assert(
  !maybeFireAlert("2026-08-14", PRESETS.friday.periods.find((p) => p.name === "Brunch")!, 60_000, settings),
  "Does not alert for brunch"
);

const ics = buildDayIcs(at(10, 0), { ...PRESETS.friday, periods: fri }, 5);
assert(ics.includes("BEGIN:VALARM"), "ICS has alarm");
assert(ics.includes("TRIGGER:-PT5M"), "ICS alarm is 5 minutes");
assert(ics.includes("Period 1"), "ICS includes period 1");
assert(!ics.includes("Brunch"), "ICS skips brunch");

const week = buildWeeklyIcs(
  [
    { byDay: "MO", schedule: PRESETS.monday },
    { byDay: "WE", schedule: getPreset("wednesday") },
  ],
  5
);
assert(week.includes("BYDAY=MO"), "Weekly Monday rrule");
assert(week.includes("BYDAY=WE"), "Weekly Wednesday rrule");
assert(PRESETS.monday.periods.filter(isAlertable).length >= 6, "Monday has class periods");

if (failed) {
  console.error(`\n${failed} failed`);
  process.exit(1);
}
console.log("\nall checks passed");
