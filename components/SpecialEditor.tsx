"use client";

import { useMemo, useState } from "react";
import {
  Period,
  PeriodKind,
  PRESETS,
  PresetId,
  formatTime12h,
  dateKey,
} from "@/lib/schedules";
import { SpecialDay, makeId } from "@/lib/storage";

const KINDS: { id: PeriodKind; label: string }[] = [
  { id: "class", label: "Class" },
  { id: "break", label: "Break" },
  { id: "passing", label: "Passing" },
  { id: "bell", label: "Bell" },
];

const PRESET_OPTIONS: { id: PresetId; label: string }[] = [
  { id: "monday", label: "Monday" },
  { id: "tuesday", label: "Tuesday" },
  { id: "wednesday", label: "Wednesday" },
  { id: "thursday", label: "Thursday" },
  { id: "friday", label: "Friday" },
  { id: "minimum", label: "Minimum Day" },
  { id: "assembly", label: "Assembly" },
];

function emptyPeriod(): Period {
  return { name: "Period", start: "08:30", end: "09:15", kind: "class" };
}

export default function SpecialEditor({
  specials,
  onChange,
  onClose,
  defaultDate,
}: {
  specials: SpecialDay[];
  onChange: (next: SpecialDay[]) => void;
  onClose: () => void;
  defaultDate: string;
}) {
  const existing = specials.find((s) => s.date === defaultDate);
  const [date, setDate] = useState(existing?.date || defaultDate);
  const [name, setName] = useState(existing?.name || "Special day");
  const [basedOn, setBasedOn] = useState<PresetId>(existing?.basedOn || "minimum");
  const [periods, setPeriods] = useState<Period[]>(
    existing?.periods.length ? existing.periods.map((p) => ({ ...p })) : PRESETS.minimum.periods.map((p) => ({ ...p }))
  );

  const clash = useMemo(
    () => specials.find((s) => s.date === date && s.id !== existing?.id),
    [specials, date, existing]
  );

  function loadPreset(id: PresetId) {
    setBasedOn(id);
    if (id === "weekend") {
      setPeriods([]);
      return;
    }
    const preset = PRESETS[id as Exclude<PresetId, "weekend">];
    if (preset) {
      setPeriods(preset.periods.map((p) => ({ ...p })));
      if (name === "Special day" || PRESET_OPTIONS.some((o) => o.label === name || PRESETS[o.id as Exclude<PresetId, "weekend">]?.label === name)) {
        setName(preset.label);
      }
    }
  }

  function updatePeriod(i: number, patch: Partial<Period>) {
    setPeriods((prev) => prev.map((p, idx) => (idx === i ? { ...p, ...patch } : p)));
  }

  function save() {
    const cleaned = periods.filter((p) => p.name.trim() && p.start && p.end);
    const next: SpecialDay = {
      id: existing?.id || makeId(),
      date,
      name: name.trim() || "Special day",
      basedOn,
      periods: cleaned,
    };
    const others = specials.filter((s) => s.date !== date);
    onChange([...others, next].sort((a, b) => a.date.localeCompare(b.date)));
    onClose();
  }

  function remove(id: string) {
    onChange(specials.filter((s) => s.id !== id));
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-0 sm:items-center sm:p-6">
      <div className="glass max-h-[94vh] w-full max-w-lg overflow-y-auto rounded-t-3xl p-5 sm:rounded-3xl">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <div className="text-[11px] uppercase tracking-[0.22em] text-gold">Special schedule</div>
            <h2 className="text-xl font-semibold">Override a date</h2>
          </div>
          <button
            onClick={onClose}
            className="rounded-full border border-white/10 px-3 py-1 text-sm text-white/70"
          >
            Close
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <label className="text-xs text-white/50">
            Date
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="mt-1 w-full rounded-xl border border-white/10 bg-navy px-3 py-2 text-sm text-white"
            />
          </label>
          <label className="text-xs text-white/50">
            Name
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1 w-full rounded-xl border border-white/10 bg-navy px-3 py-2 text-sm text-white"
            />
          </label>
        </div>

        <label className="mt-3 block text-xs text-white/50">
          Start from a built-in day
          <select
            value={basedOn}
            onChange={(e) => loadPreset(e.target.value as PresetId)}
            className="mt-1 w-full rounded-xl border border-white/10 bg-navy px-3 py-2 text-sm text-white"
          >
            {PRESET_OPTIONS.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
        </label>

        {clash && (
          <p className="mt-3 text-xs text-amber-300">
            Saving replaces the existing special already set for this date.
          </p>
        )}

        <div className="mt-4 space-y-2">
          {periods.map((period, i) => (
            <div key={i} className="space-y-2 rounded-2xl bg-black/25 p-2.5">
              <div className="flex items-center gap-2">
                <input
                  value={period.name}
                  onChange={(e) => updatePeriod(i, { name: e.target.value })}
                  className="min-w-0 flex-1 rounded-lg border border-white/10 bg-transparent px-2 py-1.5 text-sm"
                />
                <button
                  onClick={() => setPeriods((prev) => prev.filter((_, idx) => idx !== i))}
                  className="px-2 text-lg text-white/40"
                  aria-label="Remove period"
                >
                  ×
                </button>
              </div>
              <div className="grid grid-cols-[1fr_1fr_auto] gap-1.5">
                <input
                  type="time"
                  value={period.start}
                  onChange={(e) => updatePeriod(i, { start: e.target.value })}
                  className="rounded-lg border border-white/10 bg-transparent px-2 py-1.5 text-xs"
                />
                <input
                  type="time"
                  value={period.end}
                  onChange={(e) => updatePeriod(i, { end: e.target.value })}
                  className="rounded-lg border border-white/10 bg-transparent px-2 py-1.5 text-xs"
                />
                <select
                  value={period.kind}
                  onChange={(e) => updatePeriod(i, { kind: e.target.value as PeriodKind })}
                  className="rounded-lg border border-white/10 bg-navy px-2 py-1.5 text-[11px]"
                >
                  {KINDS.map((k) => (
                    <option key={k.id} value={k.id}>
                      {k.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          ))}
        </div>

        <button
          onClick={() => setPeriods((prev) => [...prev, emptyPeriod()])}
          className="mt-3 w-full rounded-xl border border-dashed border-white/15 py-2 text-sm text-white/60"
        >
          + Add period
        </button>

        <button
          onClick={save}
          className="mt-4 w-full rounded-2xl bg-gold py-3 text-sm font-semibold text-navy"
        >
          Save special for {date}
        </button>

        {specials.length > 0 && (
          <div className="mt-6">
            <div className="mb-2 text-[11px] uppercase tracking-[0.18em] text-white/40">Saved specials</div>
            <ul className="space-y-2">
              {specials.map((s) => (
                <li key={s.id} className="flex items-center justify-between rounded-xl bg-black/25 px-3 py-2 text-sm">
                  <button
                    className="text-left"
                    onClick={() => {
                      setDate(s.date);
                      setName(s.name);
                      setBasedOn(s.basedOn || "minimum");
                      setPeriods(s.periods.map((p) => ({ ...p })));
                    }}
                  >
                    <div className="font-medium">{s.name}</div>
                    <div className="text-xs text-white/45">
                      {s.date} · {s.periods.length} periods
                    </div>
                  </button>
                  <button onClick={() => remove(s.id)} className="text-xs text-red-300">
                    Delete
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
