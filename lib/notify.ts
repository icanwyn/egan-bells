import { Period, isAlertable } from "./schedules";
import { AlertSettings, loadFired, markFired } from "./storage";

/** Short pulses — long/complex patterns are ignored on many Androids. */
export const BELL_VIBRATE = [400, 120, 400, 120, 600];

let audioCtx: AudioContext | null = null;
let bellBuffer: AudioBuffer | null = null;
let bellLoad: Promise<AudioBuffer | null> | null = null;

function getAudioContext(): AudioContext {
  const Ctor =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  if (!audioCtx || audioCtx.state === "closed") {
    audioCtx = new Ctor();
  }
  return audioCtx;
}

/** Call from a tap. Chrome Android only vibrates during the user gesture. */
export function unlockAudio() {
  try {
    const ctx = getAudioContext();
    if (ctx.state === "suspended") void ctx.resume();
    void preloadBell();
  } catch {
    /* ignore */
  }
}

export async function preloadBell(): Promise<AudioBuffer | null> {
  if (bellBuffer) return bellBuffer;
  if (bellLoad) return bellLoad;
  bellLoad = (async () => {
    try {
      const ctx = getAudioContext();
      const res = await fetch("/school-bell.wav", { cache: "force-cache" });
      const raw = await res.arrayBuffer();
      bellBuffer = await ctx.decodeAudioData(raw.slice(0));
      return bellBuffer;
    } catch {
      bellLoad = null;
      return null;
    }
  })();
  return bellLoad;
}

function startBell(ctx: AudioContext, buffer: AudioBuffer) {
  const src = ctx.createBufferSource();
  src.buffer = buffer;

  const gain = ctx.createGain();
  gain.gain.value = 1.25;

  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -18;
  comp.knee.value = 8;
  comp.ratio.value = 4;
  comp.attack.value = 0.003;
  comp.release.value = 0.25;

  src.connect(gain);
  gain.connect(comp);
  comp.connect(ctx.destination);
  src.start();
}

export function playSchoolBell() {
  try {
    const ctx = getAudioContext();
    const kick = () => {
      if (bellBuffer) startBell(ctx, bellBuffer);
    };
    if (ctx.state === "suspended") {
      void ctx.resume().then(kick);
    } else {
      kick();
    }
    if (!bellBuffer) {
      void preloadBell().then((buf) => {
        if (buf && ctx.state === "running") startBell(ctx, buf);
      });
    }
  } catch {
    /* audio blocked */
  }
}

/** @deprecated use playSchoolBell */
export const playChime = playSchoolBell;

export function buzzPhone(): boolean {
  const vibrate = navigator.vibrate?.bind(navigator);
  if (!vibrate) return false;
  try {
    // Do not call vibrate(0) first — that cancels the next pattern on some Androids.
    return !!vibrate(BELL_VIBRATE);
  } catch {
    return false;
  }
}

/** Must run in the same tap as the button — before any await. */
export function fireHapticsAndBell() {
  unlockAudio();
  const buzzed = buzzPhone();
  playSchoolBell();
  return buzzed;
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
  if (typeof Notification === "undefined" || Notification.permission !== "granted") return;

  const opts: NotificationOptions = {
    body,
    icon: "/icon.png",
    badge: "/icon.png",
    tag: `egan-${title}`,
    vibrate: BELL_VIBRATE,
    silent: false,
    requireInteraction: true,
  } as NotificationOptions;

  // Page notification vibrates more reliably on Chrome Android than SW-only.
  try {
    new Notification(title, opts);
    return;
  } catch {
    /* fall through to SW */
  }

  try {
    const ready = navigator.serviceWorker?.ready;
    if (!ready) return;
    const reg = await Promise.race([
      ready,
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 800)),
    ]);
    if (reg) await reg.showNotification(title, opts);
  } catch {
    /* ignore */
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
