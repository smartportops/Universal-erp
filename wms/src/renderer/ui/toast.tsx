import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { AlertTriangle, CheckCircle2, Info } from "lucide-react";
import { cn } from "@/lib/format";
import { beep } from "@/lib/scanner";
import { getSettings } from "@/lib/settings";

type Toast = { id: number; tone: "ok" | "error" | "info"; title: string; body?: string };

type ToastApi = {
  ok(title: string, body?: string): void;
  error(title: string, body?: string): void;
  info(title: string, body?: string): void;
};

const ToastContext = createContext<ToastApi | null>(null);
let counter = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);

  const push = useCallback((tone: Toast["tone"], title: string, body?: string) => {
    const id = ++counter;
    setItems((list) => [...list, { id, tone, title, body }]);
    if (getSettings().soundOnScan && tone !== "info") beep(tone === "ok" ? "ok" : "error");
    window.setTimeout(() => setItems((list) => list.filter((item) => item.id !== id)), tone === "error" ? 6000 : 3200);
  }, []);

  const api = useMemo<ToastApi>(
    () => ({
      ok: (title, body) => push("ok", title, body),
      error: (title, body) => push("error", title, body),
      info: (title, body) => push("info", title, body),
    }),
    [push],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="pointer-events-none fixed bottom-6 right-6 z-[60] flex w-96 flex-col gap-3">
        {items.map((item) => (
          <div
            key={item.id}
            className={cn(
              "fade-in pointer-events-auto flex items-start gap-3 rounded-xl px-4 py-3.5 text-white shadow-xl",
              item.tone === "ok" && "bg-accent-strong",
              item.tone === "error" && "bg-danger",
              item.tone === "info" && "bg-ink",
            )}
          >
            {item.tone === "ok" ? <CheckCircle2 className="mt-0.5 size-5 shrink-0" /> : item.tone === "error" ? <AlertTriangle className="mt-0.5 size-5 shrink-0" /> : <Info className="mt-0.5 size-5 shrink-0" />}
            <div className="min-w-0">
              <div className="text-[15px] font-semibold">{item.title}</div>
              {item.body ? <div className="mt-0.5 text-[13.5px] text-white/85">{item.body}</div> : null}
            </div>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const api = useContext(ToastContext);
  if (!api) throw new Error("useToast outside ToastProvider");
  return api;
}
