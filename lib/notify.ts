import { Period, isAlertable } from "./schedules";
import { AlertSettings, loadFired, markFired } from "./storage";

export function playChime() {
  try {
    const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    const now = ctx.currentTime;
    const notes = [784, 988, 1175];
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(0.18, now + 0.02 + i * 0.12);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45 + i * 0.12);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + i * 0.12);
      osc.stop(now + 0.5 + i * 0.12);
    });
    setTimeout(() => ctx.close(), 1600);
  } catch {
    /* audio blocked */
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
        vibrate: [200, 80, 200],
        requireInteraction: true,
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
