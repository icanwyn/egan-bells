import { Period, PresetId } from "./schedules";

const SPECIALS_KEY = "egan-bells-specials-v1";
const SETTINGS_KEY = "egan-bells-settings-v1";
const FIRED_KEY = "egan-bells-fired-v1";

export interface SpecialDay {
  id: string;
  date: string;
  name: string;
  basedOn?: PresetId;
  periods: Period[];
}

export interface AlertSettings {
  enabled: boolean;
  minutes: number;
  sound: boolean;
  vibrate: boolean;
  keepAwake: boolean;
}

export const DEFAULT_SETTINGS: AlertSettings = {
  enabled: false,
  minutes: 5,
  sound: true,
  vibrate: true,
  keepAwake: true,
};

export function loadSpecials(): SpecialDay[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(SPECIALS_KEY);
    return raw ? (JSON.parse(raw) as SpecialDay[]) : [];
  } catch {
    return [];
  }
}

export function saveSpecials(specials: SpecialDay[]) {
  localStorage.setItem(SPECIALS_KEY, JSON.stringify(specials));
}

export function loadSettings(): AlertSettings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    return raw ? { ...DEFAULT_SETTINGS, ...JSON.parse(raw) } : DEFAULT_SETTINGS;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(settings: AlertSettings) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

const memoryStore: Record<string, string> = {};

function readStore(key: string): string | null {
  if (typeof window !== "undefined") {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  }
  return memoryStore[key] ?? null;
}

function writeStore(key: string, value: string) {
  if (typeof window !== "undefined") {
    localStorage.setItem(key, value);
    return;
  }
  memoryStore[key] = value;
}

export function loadFired(): Record<string, true> {
  try {
    const raw = readStore(FIRED_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function markFired(id: string) {
  const all = loadFired();
  all[id] = true;
  const keys = Object.keys(all);
  if (keys.length > 200) {
    keys.slice(0, keys.length - 200).forEach((k) => delete all[k]);
  }
  writeStore(FIRED_KEY, JSON.stringify(all));
}

export function makeId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}
