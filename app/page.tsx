"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import SpecialEditor from "@/components/SpecialEditor";
import {
  DaySchedule,
  PRESETS,
  PresetId,
  WEEKDAY_PRESET,
  dateKey,
  formatTime12h,
  getPreset,
  prettyDate,
  weekdayLabel,
  withPassing,
} from "@/lib/schedules";
import {
  currentState,
  formatClock,
  formatCompact,
  formatRemaining,
  getDayPhase,
  getPeriodStates,
  nowMsOfDay,
  PeriodState,
} from "@/lib/time";
import {
  AlertSettings,
  DEFAULT_SETTINGS,
  SpecialDay,
  loadRunAs,
  loadSettings,
  loadSpecials,
  saveRunAs,
  saveSettings,
  saveSpecials,
} from "@/lib/storage";
import { buildDayIcs, buildWeeklyIcs, downloadIcs } from "@/lib/ics";
import {
  ensurePermission,
  fireHapticsAndBell,
  maybeFireAlert,
  playSchoolBell,
  preloadBell,
  registerSW,
  requestWakeLock,
  showAlert,
  unlockAudio,
  buzzPhone,
} from "@/lib/notify";

const DAY_CHIPS: { id: PresetId; label: string }[] = [
  { id: "monday", label: "Mon" },
  { id: "tuesday", label: "Tue" },
  { id: "wednesday", label: "Wed" },
  { id: "thursday", label: "Thu" },
  { id: "friday", label: "Fri" },
  { id: "minimum", label: "Min" },
  { id: "assembly", label: "Asm" },
];

function resolveSchedule(
  viewDate: Date,
  specials: SpecialDay[],
  runAs: PresetId | "auto"
): { schedule: DaySchedule; source: "special" | "preset" | "weekend"; special?: SpecialDay } {
  const key = dateKey(viewDate);
  if (runAs !== "auto") {
    const schedule = getPreset(runAs);
    return { schedule, source: runAs === "weekend" ? "weekend" : "preset" };
  }
  const special = specials.find((s) => s.date === key);
  if (special) {
    return {
      schedule: {
        id: special.id,
        label: special.name,
        short: "Sp",
        note: "Your special schedule",
        periods: special.periods,
      },
      source: "special",
      special,
    };
  }
  const presetId = WEEKDAY_PRESET[viewDate.getDay()];
  return { schedule: getPreset(presetId), source: presetId === "weekend" ? "weekend" : "preset" };
}

function Ring({ progress, urgent }: { progress: number; urgent: boolean }) {
  const size = 236;
  const stroke = 10;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - Math.min(Math.max(progress, 0), 1));
  const color = urgent ? "#F07167" : "#D4AF37";
  return (
    <svg width={size} height={size} className="clock-ring">
      <circle cx={size / 2} cy={size / 2} r={r} stroke="rgba(255,255,255,0.08)" strokeWidth={stroke} fill="none" />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        stroke={color}
        strokeWidth={stroke}
        fill="none"
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={offset}
      />
    </svg>
  );
}

export default function HomePage() {
  const [now, setNow] = useState(() => new Date());
  const [specials, setSpecials] = useState<SpecialDay[]>([]);
  const [settings, setSettings] = useState<AlertSettings>(DEFAULT_SETTINGS);
  const [runAs, setRunAs] = useState<PresetId | "auto">("auto");
  const [editorOpen, setEditorOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [perm, setPerm] = useState<NotificationPermission>("default");
  const [standalone, setStandalone] = useState(false);
  const wakeRef = useRef<WakeLockSentinel | null>(null);

  useEffect(() => {
    setSpecials(loadSpecials());
    setSettings(loadSettings());
    setRunAs(loadRunAs(dateKey(new Date())));
    if (typeof Notification !== "undefined") setPerm(Notification.permission);
    setStandalone(
      window.matchMedia("(display-mode: standalone)").matches ||
        (navigator as Navigator & { standalone?: boolean }).standalone === true
    );
    registerSW();
    void preloadBell();
    const unlock = () => unlockAudio();
    window.addEventListener("pointerdown", unlock);
    const tick = setInterval(() => setNow(new Date()), 250);
    return () => {
      clearInterval(tick);
      window.removeEventListener("pointerdown", unlock);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function lock() {
      if (settings.enabled && settings.keepAwake) {
        const sent = await requestWakeLock();
        if (!cancelled) wakeRef.current = sent;
      } else {
        await wakeRef.current?.release().catch(() => undefined);
        wakeRef.current = null;
      }
    }
    lock();
    const onVis = () => {
      if (document.visibilityState === "visible") lock();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [settings.enabled, settings.keepAwake]);

  const todayKey = dateKey(now);
  const calendarPreset = WEEKDAY_PRESET[now.getDay()];
  const calendarLabel = weekdayLabel(now);

  useEffect(() => {
    setRunAs(loadRunAs(todayKey));
  }, [todayKey]);

  const chooseRunAs = useCallback(
    (next: PresetId | "auto") => {
      setRunAs(next);
      saveRunAs(todayKey, next);
      if (next === "auto") {
        setToast(`Back to ${calendarLabel} bells`);
      } else {
        const label = getPreset(next).label;
        setToast(`Today is running the ${label} schedule`);
      }
    },
    [todayKey, calendarLabel]
  );

  const resolved = useMemo(() => resolveSchedule(now, specials, runAs), [now, specials, runAs]);
  const periods = useMemo(() => withPassing(resolved.schedule.periods), [resolved.schedule]);
  const states = useMemo(() => getPeriodStates(periods, now), [periods, now]);
  const live = true;
  const current = currentState(states);
  const upcoming = states.find((s) => s.status === "upcoming");
  const phase = getDayPhase(resolved.schedule, now);

  useEffect(() => {
    if (!live || !settings.enabled) return;
    for (const state of states) {
      if (state.status !== "current") continue;
      if (maybeFireAlert(todayKey, state.period, state.remainingMs, settings)) {
        const title = `${state.period.name} ends in ${settings.minutes} min`;
        const body = `${formatTime12h(state.period.end)} · pack up and get ready to move`;
        if (settings.vibrate) buzzPhone();
        if (settings.sound) playSchoolBell();
        void showAlert(title, body);
        setToast(title);
      }
    }
  }, [states, settings, todayKey, live]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 6000);
    return () => clearTimeout(t);
  }, [toast]);

  const persistSettings = useCallback((next: AlertSettings) => {
    setSettings(next);
    saveSettings(next);
  }, []);

  const persistSpecials = useCallback((next: SpecialDay[]) => {
    setSpecials(next);
    saveSpecials(next);
  }, []);

  async function enableAlerts(on: boolean) {
    if (on) {
      unlockAudio();
      buzzPhone();
      const permission = await ensurePermission();
      setPerm(permission);
      if (permission !== "granted") {
        persistSettings({ ...settings, enabled: false });
        setHelpOpen(true);
        setToast("Allow notifications, or add alerts to your calendar instead.");
        return;
      }
    }
    persistSettings({ ...settings, enabled: on });
    if (on) setToast(`Alerts on — school bell + buzz ${settings.minutes} min before class ends`);
  }

  async function testAlert() {
    const buzzed = fireHapticsAndBell();
    setToast(buzzed ? "Test sent — bell + vibration" : "Test sent — if it did not buzz, tap again (Android needs the tap)");
    const permission = await ensurePermission();
    setPerm(permission);
    void showAlert("Period 4 ends in 5 min", "This is a test. You should hear a school bell and feel a buzz.");
  }

  function addTodayToCalendar() {
    downloadIcs(
      `egan-${todayKey}.ics`,
      buildDayIcs(now, { ...resolved.schedule, periods }, settings.minutes)
    );
    setToast("Calendar file downloaded — open it to add phone alerts");
  }

  function addWeeklyToCalendar() {
    downloadIcs(
      "egan-weekly.ics",
      buildWeeklyIcs(
        [
          { byDay: "MO", schedule: PRESETS.monday },
          { byDay: "TU", schedule: PRESETS.tuesday },
          { byDay: "WE", schedule: PRESETS.wednesday },
          { byDay: "TH", schedule: PRESETS.thursday },
          { byDay: "FR", schedule: PRESETS.friday },
        ],
        settings.minutes
      )
    );
    setToast("Weekly calendar file downloaded");
  }

  const urgent = !!current && current.remainingMs <= settings.minutes * 60_000;
  const hero = heroCopy({ phase, current, upcoming, live, schedule: resolved.schedule, now });

  return (
    <main className="mx-auto min-h-screen max-w-lg px-4 pb-16 pt-4">
      <header className="mb-5 flex items-start justify-between">
        <div className="flex items-center gap-3">
          <img src="/viking.png" alt="" className="h-10 w-10 object-contain" />
          <div>
            <div className="text-[11px] uppercase tracking-[0.28em] text-gold">Egan Jr. High</div>
            <h1 className="text-2xl font-semibold leading-none">Bells</h1>
          </div>
        </div>
        <div className="text-right">
          <div className="text-sm text-white/80">{prettyDate(now)}</div>
          <div className="font-mono text-xs text-white/45">{formatClock(now)}</div>
        </div>
      </header>

      <section className="glass mb-4 rounded-[24px] p-3.5">
        <label className="block">
          <div className="mb-1.5 flex items-baseline justify-between gap-2">
            <span className="text-[11px] uppercase tracking-[0.18em] text-gold">Run today as</span>
            <span className="text-[11px] text-white/40">
              {calendarLabel}
              {runAs !== "auto" ? ` · using ${resolved.schedule.label}` : ""}
            </span>
          </div>
          <select
            value={runAs}
            onChange={(e) => chooseRunAs(e.target.value as PresetId | "auto")}
            className="w-full rounded-2xl border border-white/10 bg-navy px-3 py-2.5 text-sm font-medium text-white"
          >
            <option value="auto">Auto — {calendarLabel} schedule</option>
            {DAY_CHIPS.map((d) => (
              <option key={d.id} value={d.id}>
                {getPreset(d.id).label}
                {d.id === calendarPreset ? " (calendar today)" : ""}
              </option>
            ))}
          </select>
        </label>
        <div className="mt-2.5 flex gap-1.5 overflow-x-auto pb-0.5">
          <Chip active={runAs === "auto"} onClick={() => chooseRunAs("auto")}>
            Auto
          </Chip>
          {DAY_CHIPS.map((d) => (
            <Chip key={d.id} active={runAs === d.id} onClick={() => chooseRunAs(d.id)}>
              {d.label}
            </Chip>
          ))}
        </div>
        {runAs !== "auto" && (
          <p className="mt-2 text-[11px] leading-relaxed text-white/45">
            Countdown and alerts follow {resolved.schedule.label} bells, even though it is {calendarLabel}. Resets
            tomorrow.
          </p>
        )}
      </section>

      <section className="glass relative mb-4 overflow-hidden rounded-[28px] px-5 pb-6 pt-5">
        <div className="mb-3 flex items-center justify-between text-xs">
          <span className="rounded-full bg-gold/15 px-2.5 py-1 font-medium text-gold">
            {resolved.schedule.label}
            {runAs !== "auto"
              ? ` · ${calendarLabel} running as this`
              : resolved.source === "special"
                ? " · special"
                : " · live"}
          </span>
          {resolved.schedule.note && (
            <span className="hidden max-w-[55%] text-right text-white/40 sm:inline">{resolved.schedule.note}</span>
          )}
        </div>

        <div className="relative mx-auto grid place-items-center">
          {current && live ? (
            <>
              <Ring progress={current.progress} urgent={urgent} />
              <div className="absolute inset-0 grid place-items-center text-center">
                <div>
                  <div className="text-[11px] uppercase tracking-[0.22em] text-white/45">{current.period.name}</div>
                  <div className={`clock text-[72px] leading-none ${urgent ? "text-[#F07167]" : "text-white"}`}>
                    {formatRemaining(current.remainingMs)}
                  </div>
                  <div className="mt-1 text-sm text-white/50">left · ends {formatTime12h(current.period.end)}</div>
                </div>
              </div>
            </>
          ) : (
            <div className="flex h-[236px] w-[236px] flex-col items-center justify-center text-center">
              <div className="text-[11px] uppercase tracking-[0.22em] text-white/45">{hero.kicker}</div>
              <div className="clock mt-1 text-[56px] leading-none">{hero.time}</div>
              <div className="mt-2 max-w-[200px] text-sm text-white/50">{hero.sub}</div>
            </div>
          )}
        </div>

        {upcoming && (
          <div className="mt-2 rounded-2xl bg-black/25 px-4 py-3 text-sm">
            <div className="text-[11px] uppercase tracking-[0.16em] text-white/35">Next</div>
            <div className="flex items-baseline justify-between gap-3">
              <div className="min-w-0">
                <div className="truncate font-medium">{upcoming.period.name}</div>
                <div className="text-xs text-white/45">
                  {formatTime12h(upcoming.period.start)} – {formatTime12h(upcoming.period.end)}
                </div>
              </div>
              {live && upcoming.status === "upcoming" && (
                <span className="shrink-0 text-gold">
                  in {formatCompact(timeToMs(upcoming.period.start) - nowMsOfDay(now))}
                </span>
              )}
            </div>
          </div>
        )}
      </section>

      <section className="glass mb-4 rounded-[24px] p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-sm font-medium">Alert me 5 minutes before class ends</div>
            <div className="text-xs text-white/45">
              {settings.enabled
                ? perm === "granted"
                  ? "Loud school bell + vibration while this app is open"
                  : "Notifications blocked — use calendar alerts"
                : "Off"}
            </div>
          </div>
          <Toggle on={settings.enabled} onChange={enableAlerts} />
        </div>

        {settings.enabled && (
          <div className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
            <label className="rounded-xl bg-black/25 p-2 text-white/60">
              Minutes
              <select
                value={settings.minutes}
                onChange={(e) => persistSettings({ ...settings, minutes: Number(e.target.value) })}
                className="mt-1 w-full bg-transparent text-white"
              >
                {[1, 2, 3, 5, 7, 10].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
            <button
              onClick={() => persistSettings({ ...settings, sound: !settings.sound })}
              className={`rounded-xl p-2 ${settings.sound ? "bg-gold/15 text-gold" : "bg-black/25 text-white/50"}`}
            >
              Bell {settings.sound ? "on" : "off"}
            </button>
            <button
              onClick={() => persistSettings({ ...settings, vibrate: !settings.vibrate })}
              className={`rounded-xl p-2 ${settings.vibrate ? "bg-gold/15 text-gold" : "bg-black/25 text-white/50"}`}
            >
              Vibrate {settings.vibrate ? "on" : "off"}
            </button>
            <button
              onClick={() => persistSettings({ ...settings, keepAwake: !settings.keepAwake })}
              className={`rounded-xl p-2 ${settings.keepAwake ? "bg-gold/15 text-gold" : "bg-black/25 text-white/50"}`}
            >
              Keep screen on
            </button>
          </div>
        )}

        <div className="mt-3 grid grid-cols-2 gap-2">
          <button
            onPointerDown={testAlert}
            className="rounded-xl border border-white/10 py-2 text-xs text-white/70"
          >
            Test alert
          </button>
          <button onClick={() => setHelpOpen(true)} className="rounded-xl border border-white/10 py-2 text-xs text-white/70">
            Phone setup
          </button>
          <button onClick={addTodayToCalendar} className="rounded-xl bg-gold/15 py-2 text-xs font-medium text-gold">
            Today calendar
          </button>
          <button onClick={addWeeklyToCalendar} className="rounded-xl bg-gold/15 py-2 text-xs font-medium text-gold">
            Weekly calendar
          </button>
        </div>

        {!standalone && (
          <p className="mt-3 text-[11px] leading-relaxed text-white/40">
            Add this page to your Home Screen so it opens like an app. On iPhone, calendar alerts still fire if Safari is closed.
          </p>
        )}
      </section>

      <section className="mb-4">
        <div className="mb-2 flex items-end justify-between">
          <h2 className="text-sm font-medium text-white/70">Periods</h2>
          <button onClick={() => setEditorOpen(true)} className="shrink-0 text-xs font-medium text-gold">
            Special schedule
          </button>
        </div>
        <p className="mb-3 text-[11px] text-white/35">
          Pick “Run today as” when school follows a different day’s bells (for example Monday on a Tuesday with no
          tutorial). Add a special if the times themselves change.
        </p>
        {periods.length === 0 ? (
          <div className="glass rounded-2xl px-4 py-8 text-center text-sm text-white/50">No school today.</div>
        ) : (
          <ul className="space-y-1.5">
            {(live ? states : getPeriodStates(periods, now)).map((state, i) => (
              <PeriodRow key={`${state.period.name}-${i}`} state={state} live={live} now={now} />
            ))}
          </ul>
        )}
      </section>

      {toast && (
        <div className="fixed bottom-6 left-1/2 z-40 w-[min(92vw,28rem)] -translate-x-1/2 rounded-2xl bg-gold px-4 py-3 text-center text-sm font-medium text-navy shadow-lg">
          {toast}
        </div>
      )}

      {editorOpen && (
        <SpecialEditor
          specials={specials}
          onChange={persistSpecials}
          onClose={() => setEditorOpen(false)}
          defaultDate={todayKey}
        />
      )}

      {helpOpen && (
        <HelpSheet
          standalone={standalone}
          perm={perm}
          onClose={() => setHelpOpen(false)}
          onCalendar={addWeeklyToCalendar}
        />
      )}
    </main>
  );
}

function timeToMs(hhmm: string) {
  const [h, m] = hhmm.split(":").map(Number);
  return (h * 60 + m) * 60_000;
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-medium ${
        active ? "bg-gold text-navy" : "bg-white/5 text-white/65"
      }`}
    >
      {children}
    </button>
  );
}

function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      role="switch"
      aria-checked={on}
      onPointerDown={() => {
        if (!on) {
          unlockAudio();
          buzzPhone();
        }
      }}
      onClick={() => onChange(!on)}
      className={`relative h-8 w-14 rounded-full transition ${on ? "bg-gold" : "bg-white/15"}`}
    >
      <span className={`absolute top-1 h-6 w-6 rounded-full bg-navy transition ${on ? "left-7" : "left-1"}`} />
    </button>
  );
}

function PeriodRow({ state, live, now }: { state: PeriodState; live: boolean; now: Date }) {
  const { period, status } = state;
  const isNow = live && status === "current";
  const label =
    !live
      ? `${periodDuration(period)} min`
      : status === "current"
        ? `${formatRemaining(state.remainingMs)} left`
        : status === "done"
          ? "ended"
          : `in ${formatCompact(timeToMs(period.start) - nowMsOfDay(now))}`;

  return (
    <li
      className={`flex items-center justify-between rounded-2xl px-3.5 py-2.5 ${
        isNow ? "bg-gold/15 ring-1 ring-gold/40" : "bg-white/[0.035]"
      }`}
    >
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          {isNow && <span className="live-dot h-2 w-2 rounded-full bg-gold" />}
          <span className={`truncate text-sm ${period.kind === "class" ? "font-medium" : "text-white/70"}`}>
            {period.name}
          </span>
        </div>
        <div className="text-[11px] text-white/40">
          {formatTime12h(period.start)} – {formatTime12h(period.end)}
        </div>
      </div>
      <div className={`text-right text-sm tabular-nums ${isNow ? "text-gold" : "text-white/50"}`}>{label}</div>
    </li>
  );
}

function periodDuration(period: { start: string; end: string }) {
  return Math.round((timeToMs(period.end) - timeToMs(period.start)) / 60_000);
}

function heroCopy({
  phase,
  current,
  upcoming,
  live,
  schedule,
  now,
}: {
  phase: ReturnType<typeof getDayPhase>;
  current?: PeriodState;
  upcoming?: PeriodState;
  live: boolean;
  schedule: DaySchedule;
  now: Date;
}) {
  if (!live) {
    return {
      kicker: "Preview",
      time: schedule.periods.length ? formatTime12h(schedule.periods[0].start) : "Off",
      sub: schedule.periods.length ? `${schedule.label} starts here` : "No classes",
    };
  }
  if (phase === "weekend") return { kicker: "Weekend", time: "Off", sub: "See you Monday" };
  if (phase === "before" && upcoming) {
    return {
      kicker: "School starts",
      time: formatRemaining(timeToMs(upcoming.period.start) - nowMsOfDay(now)),
      sub: `${upcoming.period.name} at ${formatTime12h(upcoming.period.start)}`,
    };
  }
  if (phase === "after") return { kicker: "School's out", time: "Done", sub: "See you next bell" };
  if (current) {
    return {
      kicker: current.period.name,
      time: formatRemaining(current.remainingMs),
      sub: `ends ${formatTime12h(current.period.end)}`,
    };
  }
  return { kicker: "Between bells", time: "—", sub: upcoming ? `Next is ${upcoming.period.name}` : "That's it" };
}

function HelpSheet({
  standalone,
  perm,
  onClose,
  onCalendar,
}: {
  standalone: boolean;
  perm: NotificationPermission;
  onClose: () => void;
  onCalendar: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 sm:items-center sm:p-6">
      <div className="glass w-full max-w-lg rounded-t-3xl p-5 sm:rounded-3xl">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Get alerts on your phone</h2>
          <button onClick={onClose} className="text-sm text-white/50">
            Close
          </button>
        </div>
        <ol className="space-y-3 text-sm text-white/70">
          <li>
            <span className="font-medium text-white">1. Add to Home Screen.</span> Safari → Share → Add to Home Screen.
            Open Egan Bells from the icon, not a tab. {standalone ? "You're already running as an app." : ""}
          </li>
          <li>
            <span className="font-medium text-white">2. Allow notifications.</span> Status:{" "}
            <span className="text-gold">{perm}</span>. Then tap <span className="text-white">Test alert</span> — Android
            only vibrates during that tap. Keep the app open (and screen on) during school.
          </li>
          <li>
            <span className="font-medium text-white">3. For alerts even if the app is closed:</span> add the calendar
            file. Your phone will ping 5 minutes before each class ends — this is the reliable iPhone path.
          </li>
        </ol>
        <button onClick={onCalendar} className="mt-5 w-full rounded-2xl bg-gold py-3 text-sm font-semibold text-navy">
          Download weekly calendar alerts
        </button>
      </div>
    </div>
  );
}
