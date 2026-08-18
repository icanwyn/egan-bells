"use client";

import { useEffect, useRef, useState } from "react";
import { fireHapticsAndBell } from "@/lib/notify";

type Tool = "timer" | "stopwatch";

const PRESETS = [1, 2, 3, 5, 10, 15];

function pad(n: number, w = 2) {
  return String(n).padStart(w, "0");
}

function formatTool(ms: number, cents: boolean) {
  const safe = Math.max(0, ms);
  const totalSec = Math.floor(safe / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const cs = Math.floor((safe % 1000) / 10);
  const core = h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
  return cents ? `${core}.${pad(cs)}` : core;
}

export default function ClockTools() {
  const [tool, setTool] = useState<Tool>("timer");

  const [timerLeft, setTimerLeft] = useState(5 * 60_000);
  const [timerSet, setTimerSet] = useState(5 * 60_000);
  const [timerOn, setTimerOn] = useState(false);
  const timerEnd = useRef<number | null>(null);
  const timerFired = useRef(false);

  const [swMs, setSwMs] = useState(0);
  const [swOn, setSwOn] = useState(false);
  const swOrigin = useRef(0);
  const swBase = useRef(0);
  const [laps, setLaps] = useState<number[]>([]);

  useEffect(() => {
    if (!timerOn) return;
    const id = window.setInterval(() => {
      const left = Math.max(0, (timerEnd.current ?? 0) - Date.now());
      setTimerLeft(left);
      if (left <= 0 && !timerFired.current) {
        timerFired.current = true;
        setTimerOn(false);
        fireHapticsAndBell();
      }
    }, 80);
    return () => window.clearInterval(id);
  }, [timerOn]);

  useEffect(() => {
    if (!swOn) return;
    const id = window.setInterval(() => {
      setSwMs(swBase.current + (Date.now() - swOrigin.current));
    }, 40);
    return () => window.clearInterval(id);
  }, [swOn]);

  function setMinutes(min: number) {
    const ms = min * 60_000;
    setTimerOn(false);
    timerEnd.current = null;
    timerFired.current = false;
    setTimerSet(ms);
    setTimerLeft(ms);
  }

  function nudgeTimer(deltaMs: number) {
    if (timerOn) return;
    const next = Math.max(15_000, Math.min(99 * 60_000, timerSet + deltaMs));
    setTimerSet(next);
    setTimerLeft(next);
    timerFired.current = false;
  }

  function toggleTimer() {
    if (timerOn) {
      setTimerOn(false);
      timerEnd.current = null;
      return;
    }
    const startFrom = timerLeft > 0 ? timerLeft : timerSet;
    if (startFrom <= 0) return;
    timerFired.current = false;
    setTimerLeft(startFrom);
    timerEnd.current = Date.now() + startFrom;
    setTimerOn(true);
  }

  function resetTimer() {
    setTimerOn(false);
    timerEnd.current = null;
    timerFired.current = false;
    setTimerLeft(timerSet);
  }

  function toggleSw() {
    if (swOn) {
      swBase.current = swBase.current + (Date.now() - swOrigin.current);
      setSwMs(swBase.current);
      setSwOn(false);
      return;
    }
    swOrigin.current = Date.now();
    setSwOn(true);
  }

  function resetSw() {
    setSwOn(false);
    swBase.current = 0;
    swOrigin.current = 0;
    setSwMs(0);
    setLaps([]);
  }

  function lap() {
    const mark = swOn ? swBase.current + (Date.now() - swOrigin.current) : swMs;
    if (mark <= 0) return;
    setLaps((prev) => [mark, ...prev].slice(0, 8));
  }

  const timerDone = !timerOn && timerLeft === 0 && timerFired.current;

  return (
    <div className="mt-3 rounded-2xl bg-black/25 p-3.5">
      <div className="mb-3 grid grid-cols-2 gap-1 rounded-xl bg-white/5 p-1">
        <button
          onClick={() => setTool("timer")}
          className={`rounded-lg py-2 text-sm font-medium ${
            tool === "timer" ? "bg-gold text-navy" : "text-white/55"
          }`}
        >
          Timer
        </button>
        <button
          onClick={() => setTool("stopwatch")}
          className={`rounded-lg py-2 text-sm font-medium ${
            tool === "stopwatch" ? "bg-gold text-navy" : "text-white/55"
          }`}
        >
          Stopwatch
        </button>
      </div>

      {tool === "timer" ? (
        <>
          <div className={`clock text-center text-[56px] leading-none ${timerDone ? "text-[#F07167]" : "text-white"}`}>
            {formatTool(timerLeft, false)}
          </div>
          <div className="mt-1 text-center text-[11px] text-white/40">
            {timerOn ? "counting down" : timerDone ? "time’s up" : "set a countdown"}
          </div>
          {!timerOn && (
            <div className="mt-3 flex flex-wrap justify-center gap-1.5">
              {PRESETS.map((m) => (
                <button
                  key={m}
                  onClick={() => setMinutes(m)}
                  className={`rounded-full px-2.5 py-1 text-[11px] ${
                    timerSet === m * 60_000 ? "bg-gold/20 text-gold" : "bg-white/5 text-white/55"
                  }`}
                >
                  {m}m
                </button>
              ))}
              <button onClick={() => nudgeTimer(-30_000)} className="rounded-full bg-white/5 px-2.5 py-1 text-[11px] text-white/55">
                −30s
              </button>
              <button onClick={() => nudgeTimer(30_000)} className="rounded-full bg-white/5 px-2.5 py-1 text-[11px] text-white/55">
                +30s
              </button>
            </div>
          )}
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button onClick={toggleTimer} className="rounded-xl bg-gold py-2 text-sm font-semibold text-navy">
              {timerOn ? "Pause" : timerLeft > 0 && timerLeft < timerSet ? "Resume" : "Start"}
            </button>
            <button onClick={resetTimer} className="rounded-xl border border-white/10 py-2 text-sm text-white/70">
              Reset
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="clock text-center text-[56px] leading-none text-white">{formatTool(swMs, true)}</div>
          <div className="mt-1 text-center text-[11px] text-white/40">{swOn ? "running" : swMs ? "paused" : "tap start"}</div>
          <div className="mt-3 grid grid-cols-3 gap-2">
            <button onClick={toggleSw} className="rounded-xl bg-gold py-2 text-sm font-semibold text-navy">
              {swOn ? "Pause" : "Start"}
            </button>
            <button onClick={lap} className="rounded-xl border border-white/10 py-2 text-sm text-white/70">
              Lap
            </button>
            <button onClick={resetSw} className="rounded-xl border border-white/10 py-2 text-sm text-white/70">
              Reset
            </button>
          </div>
          {laps.length > 0 && (
            <ul className="mt-3 max-h-28 space-y-1 overflow-y-auto text-xs text-white/55">
              {laps.map((lapMs, i) => (
                <li key={`${lapMs}-${i}`} className="flex justify-between px-1">
                  <span>Lap {laps.length - i}</span>
                  <span className="tabular-nums text-white/80">{formatTool(lapMs, true)}</span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
