import { useSyncExternalStore } from "react";

export type Language = "de" | "en";

export type Settings = {
  serverUrl: string;
  apiKey: string;
  warehouseId: string;
  operator: string;
  language: Language;
  scannerSuffix: "enter" | "tab";
  printers: { documents: string; labels: string; articleLabels: string };
  /** work with built-in demo data instead of a server */
  demo: boolean;
  defaultCarrier: string;
  soundOnScan: boolean;
};

export const defaultSettings: Settings = {
  serverUrl: "",
  apiKey: "",
  warehouseId: "",
  operator: "",
  language: "de",
  scannerSuffix: "enter",
  printers: { documents: "", labels: "", articleLabels: "" },
  demo: true,
  defaultCarrier: "DHL",
  soundOnScan: true,
};

const KEY = "aera_wms_settings";
const listeners = new Set<() => void>();
let cache: Settings | null = null;

function read(): Settings {
  if (cache) return cache;
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as Partial<Settings>) : {};
    cache = { ...defaultSettings, ...parsed, printers: { ...defaultSettings.printers, ...(parsed.printers ?? {}) } };
  } catch {
    cache = { ...defaultSettings };
  }
  return cache;
}

export function getSettings() {
  return read();
}

export function saveSettings(patch: Partial<Settings>) {
  cache = { ...read(), ...patch };
  localStorage.setItem(KEY, JSON.stringify(cache));
  listeners.forEach((fn) => fn());
}

function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function useSettings() {
  return useSyncExternalStore(subscribe, read, read);
}

/** True when the client is configured to talk to a real ERP. */
export function isConnected(settings: Settings) {
  return !settings.demo && settings.serverUrl.trim().length > 0 && settings.apiKey.trim().length > 0;
}
