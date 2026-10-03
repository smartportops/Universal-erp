import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { WmsHandshake } from "@shared/api";
import { isConnected, useSettings } from "@/lib/settings";
import { DemoSource } from "./demo";
import { HttpSource } from "./http";
import type { WmsDataSource } from "./source";

export type Connection = {
  state: "demo" | "online" | "offline" | "checking";
  handshake: WmsHandshake | null;
  error: string | null;
  refresh(): void;
};

const SourceContext = createContext<WmsDataSource | null>(null);
const ConnectionContext = createContext<Connection | null>(null);

let demo: DemoSource | null = null;

export function DataProvider({ children }: { children: ReactNode }) {
  const settings = useSettings();
  const connected = isConnected(settings);
  const source = useMemo<WmsDataSource>(() => {
    if (connected) return new HttpSource(settings.serverUrl, settings.apiKey, settings.warehouseId);
    demo ??= new DemoSource();
    return demo;
  }, [connected, settings.serverUrl, settings.apiKey, settings.warehouseId]);

  const [handshake, setHandshake] = useState<WmsHandshake | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [state, setState] = useState<Connection["state"]>("checking");
  const [tick, setTick] = useState(0);
  const refresh = useCallback(() => setTick((n) => n + 1), []);

  useEffect(() => {
    let cancelled = false;
    setState("checking");
    source
      .handshake()
      .then((result) => {
        if (cancelled) return;
        setHandshake(result);
        setError(null);
        setState(source.kind === "demo" ? "demo" : "online");
      })
      .catch((err: Error) => {
        if (cancelled) return;
        setHandshake(null);
        setError(err.message);
        setState(source.kind === "demo" ? "demo" : "offline");
      });
    return () => {
      cancelled = true;
    };
  }, [source, tick]);

  const connection = useMemo<Connection>(() => ({ state, handshake, error, refresh }), [state, handshake, error, refresh]);

  return (
    <SourceContext.Provider value={source}>
      <ConnectionContext.Provider value={connection}>{children}</ConnectionContext.Provider>
    </SourceContext.Provider>
  );
}

export function useData() {
  const source = useContext(SourceContext);
  if (!source) throw new Error("useData outside DataProvider");
  return source;
}

export function useConnection() {
  const connection = useContext(ConnectionContext);
  if (!connection) throw new Error("useConnection outside DataProvider");
  return connection;
}

/**
 * Minimal async loader: `const { data, loading, error, reload } = useLoad(() => source.bins(), [source])`.
 * Re-runs when `deps` change; `reload()` re-fetches in place.
 */
export function useLoad<T>(loader: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const fn = useRef(loader);
  fn.current = loader;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fn.current()
      .then((result) => {
        if (cancelled) return;
        setData(result);
        setError(null);
      })
      .catch((err: Error) => {
        if (cancelled) return;
        setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, version]);

  const reload = useCallback(() => setVersion((n) => n + 1), []);
  return { data, loading, error, reload, setData };
}
