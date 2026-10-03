import { useEffect, useRef } from "react";

/**
 * Keyboard-wedge barcode listener. Most USB/Bluetooth scanners type the code
 * very fast and finish with Enter (or Tab). We collect bursts of keystrokes
 * that are not aimed at an editable element and hand the result to `onScan`.
 *
 * Inputs keep working normally: when the focus is inside an input/textarea
 * the wedge stays quiet and the component (e.g. <ScanInput>) handles it.
 */
export function useScanner(onScan: (code: string) => void, options?: { suffix?: "enter" | "tab"; enabled?: boolean }) {
  const handler = useRef(onScan);
  handler.current = onScan;
  const enabled = options?.enabled ?? true;
  const suffix = options?.suffix ?? "enter";

  useEffect(() => {
    if (!enabled) return;
    let buffer = "";
    let last = 0;
    const terminator = suffix === "tab" ? "Tab" : "Enter";
    const listener = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;
      const now = Date.now();
      if (now - last > 80) buffer = "";
      last = now;
      if (event.key === terminator) {
        if (buffer.length >= 3) {
          event.preventDefault();
          handler.current(buffer);
        }
        buffer = "";
        return;
      }
      if (event.key.length === 1 && !event.metaKey && !event.ctrlKey && !event.altKey) buffer += event.key;
    };
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, [enabled, suffix]);
}

let context: AudioContext | null = null;

/** Short confirmation beep so operators do not have to look at the screen. */
export function beep(kind: "ok" | "error" = "ok") {
  try {
    context ??= new AudioContext();
    const osc = context.createOscillator();
    const gain = context.createGain();
    osc.type = "sine";
    osc.frequency.value = kind === "ok" ? 1320 : 220;
    gain.gain.value = 0.08;
    osc.connect(gain).connect(context.destination);
    osc.start();
    osc.stop(context.currentTime + (kind === "ok" ? 0.09 : 0.25));
  } catch {
    /* audio not available */
  }
}
