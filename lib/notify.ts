import { Period, isAlertable } from "./schedules";
import { AlertSettings, loadFired, markFired } from "./storage";

/** Three long pulses, timed with the bell rings. */
export const BELL_VIBRATE = [480, 90, 480, 90, 640, 120, 420, 80, 420];

let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext {
  const Ctor =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  if (!audioCtx || audioCtx.state === "closed") {
    audioCtx = new Ctor();
  }
  return audioCtx;
}

function saturatorCurve(amount: number) {
  const n = 256;
  const curve = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i * 2) / n - 1;
    curve[i] = Math.tanh(x * amount);
  }
  return curve;
}

function strikeNoise(ctx: AudioContext, dest: AudioNode, t: number, gain: number) {
  const dur = 0.06;
  const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * dur), ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) {
    data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (data.length * 0.18));
  }
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const hp = ctx.createBiquadFilter();
  hp.type = "highpass";
  hp.frequency.value = 1600;
  const g = ctx.createGain();
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(hp);
  hp.connect(g);
  g.connect(dest);
  src.start(t);
}

function metallicClang(ctx: AudioContext, dest: AudioNode, t: number) {
  const partials: Array<[number, number, OscillatorType]> = [
    [786, 0.72, "triangle"],
    [980, 0.38, "triangle"],
    [1178, 0.62, "square"],
    [1572, 0.36, "sawtooth"],
    [1964, 0.24, "square"],
    [2358, 0.16, "triangle"],
    [3144, 0.1, "square"],
  ];

  for (const [freq, gain, type] of partials) {
    const osc = ctx.createOscillator();
    const filter = ctx.createBiquadFilter();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq * 1.06, t);
    osc.frequency.exponentialRampToValueAtTime(freq, t + 0.045);
    filter.type = "bandpass";
    filter.frequency.value = freq;
    filter.Q.value = 12;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.95);
    osc.connect(filter);
    filter.connect(g);
    g.connect(dest);
    osc.start(t);
    osc.stop(t + 1);
  }

  // Electric clapper — rapid hits so it reads as a hallway school bell, not a church bell
  for (let i = 0; i < 6; i++) {
    const hit = t + i * 0.026;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = "square";
    osc.frequency.value = 1080 + i * 18;
    g.gain.setValueAtTime(0.0001, hit);
    g.gain.exponentialRampToValueAtTime(0.42 - i * 0.04, hit + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, hit + 0.03);
    osc.connect(g);
    g.connect(dest);
    osc.start(hit);
    osc.stop(hit + 0.04);
  }

  strikeNoise(ctx, dest, t, 0.85);
}

export async function playSchoolBell() {
  try {
    const ctx = getAudioContext();
    if (ctx.state === "suspended") await ctx.resume();

    const master = ctx.createGain();
    master.gain.value = 1.15;

    const shaper = ctx.createWaveShaper();
    shaper.curve = saturatorCurve(2.6);
    shaper.oversample = "2x";

    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16;
    comp.knee.value = 10;
    comp.ratio.value = 6;
    comp.attack.value = 0.002;
    comp.release.value = 0.18;

    master.connect(shaper);
    shaper.connect(comp);
    comp.connect(ctx.destination);

    const now = ctx.currentTime;
    [0, 0.62, 1.28].forEach((offset) => metallicClang(ctx, master, now + offset));
  } catch {
    /* audio blocked */
  }
}

/** @deprecated use playSchoolBell */
export const playChime = playSchoolBell;

export function buzzPhone(): boolean {
  if (typeof navigator === "undefined" || typeof navigator.vibrate !== "function") return false;
  try {
    navigator.vibrate(0);
    return navigator.vibrate(BELL_VIBRATE);
  } catch {
    return false;
  }
}

export async function ensurePermission(): Promise<NotificationPermission> {
  if (typeof Notification === "undefined") return "denied";
  if (Notification.permission === "granted") return "granted";
  if (Notification.permission === "denied") return "denied";
  return Notification.requestPermission();
}

export async function registerSW(): Promise<ServiceWorkerRegistration | null> {
  if (!("serviceWorker" in navigator)) return null;
  try {
    return await navigator.serviceWorker.register("/sw.js");
  } catch {
    return null;
  }
}

export async function showAlert(title: string, body: string) {
  const tag = `egan-${title}`;
  if (navigator.serviceWorker) {
    const reg = await navigator.serviceWorker.ready.catch(() => null);
    if (reg) {
      await reg.showNotification(title, {
        body,
        icon: "/icon.png",
        badge: "/icon.png",
        tag,
        vibrate: BELL_VIBRATE,
        requireInteraction: true,
        silent: false,
      } as NotificationOptions);
      return;
    }
  }
  if (typeof Notification !== "undefined" && Notification.permission === "granted") {
    new Notification(title, { body, icon: "/icon.png", tag });
  }
}

export function alertId(date: string, period: Period, minutes: number) {
  return `${date}|${period.name}|${period.end}|${minutes}`;
}

export function maybeFireAlert(
  date: string,
  period: Period,
  remainingMs: number,
  settings: AlertSettings
): boolean {
  if (!settings.enabled) return false;
  if (!isAlertable(period)) return false;
  const windowMs = settings.minutes * 60_000;
  if (remainingMs > windowMs || remainingMs <= 0) return false;
  const id = alertId(date, period, settings.minutes);
  if (loadFired()[id]) return false;
  markFired(id);
  return true;
}

export async function requestWakeLock(): Promise<WakeLockSentinel | null> {
  try {
    if (!("wakeLock" in navigator)) return null;
    return await navigator.wakeLock.request("screen");
  } catch {
    return null;
  }
}
