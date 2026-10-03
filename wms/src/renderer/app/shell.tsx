import { useEffect, useState, type ReactNode } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { Maximize2, Minimize2, RefreshCw, Wifi, WifiOff, FlaskConical } from "lucide-react";
import { useConnection } from "@/data/provider";
import { formatLongDate, formatTime, cn } from "@/lib/format";
import { useT } from "@/lib/i18n";
import { useSettings } from "@/lib/settings";
import { navItems } from "./nav";

function Clock() {
  const { language } = useSettings();
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000 * 10);
    return () => window.clearInterval(timer);
  }, []);
  return (
    <div className="px-5 pb-5 pt-6">
      <div className="text-[44px] font-semibold leading-none tabular-nums tracking-tight text-white">{formatTime(now, language)}</div>
      <div className="mt-2 text-[13px] text-white/55">{formatLongDate(now, language)}</div>
    </div>
  );
}

function ConnectionBadge() {
  const connection = useConnection();
  const t = useT();
  const map = {
    demo: { icon: FlaskConical, label: t("Demo data"), className: "text-amber-300" },
    online: { icon: Wifi, label: t("Connected"), className: "text-emerald-400" },
    offline: { icon: WifiOff, label: t("Offline"), className: "text-red-400" },
    checking: { icon: RefreshCw, label: t("Connecting…"), className: "text-white/50" },
  } as const;
  const item = map[connection.state];
  const Icon = item.icon;
  return (
    <button type="button" onClick={connection.refresh} className="flex h-11 w-full items-center gap-2.5 rounded-lg px-3 text-left text-[13px] font-medium text-white/80 hover:bg-white/5">
      <Icon className={cn("size-4", item.className, connection.state === "checking" && "animate-spin")} />
      <span className="truncate">{item.label}</span>
    </button>
  );
}

export function Shell() {
  const t = useT();
  const navigate = useNavigate();
  const location = useLocation();
  const connection = useConnection();
  const settings = useSettings();
  const [fullscreen, setFullscreen] = useState(false);

  useEffect(() => {
    window.wms?.isFullscreen().then(setFullscreen);
  }, []);

  // Global F-key navigation.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const item = navItems.find((entry) => entry.key === event.key);
      if (item) {
        event.preventDefault();
        navigate(item.path);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [navigate]);

  const warehouse = connection.handshake?.warehouses.find((w) => w.id === settings.warehouseId) ?? connection.handshake?.warehouses.find((w) => w.isDefault) ?? connection.handshake?.warehouses[0];

  return (
    <div className="flex h-full">
      <aside className="flex w-[264px] shrink-0 flex-col bg-side text-white">
        <div className="flex h-16 items-center gap-3 border-b border-side-line px-5">
          <span className="flex size-9 items-center justify-center rounded-lg bg-accent text-[15px] font-bold text-white">A</span>
          <div className="leading-tight">
            <div className="text-[15px] font-semibold tracking-tight">Aera WMS</div>
            <div className="text-[11.5px] text-white/50">{connection.handshake?.organization.name ?? t("Not connected")}</div>
          </div>
        </div>
        <Clock />
        <nav className="flex-1 space-y-1 px-3">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.path}
                to={item.path}
                end={item.path === "/"}
                className={({ isActive }) =>
                  cn(
                    "flex h-14 items-center gap-3 rounded-xl px-3.5 text-[15.5px] font-medium transition-colors",
                    isActive ? "bg-accent text-white shadow-sm" : "text-white/80 hover:bg-white/6 hover:text-white",
                  )
                }
              >
                <Icon className="size-5.5 shrink-0" strokeWidth={2} />
                <span className="flex-1 truncate">{t(item.label)}</span>
                <kbd className="rounded-md bg-white/10 px-1.5 py-0.5 font-mono text-[11px] text-white/70">{item.key}</kbd>
              </NavLink>
            );
          })}
        </nav>
        <div className="space-y-1 border-t border-side-line p-3">
          <div className="px-3 pb-1 pt-2">
            <div className="text-[11px] uppercase tracking-wide text-white/40">{t("Warehouse")}</div>
            <div className="truncate text-[14px] font-medium">{warehouse ? `${warehouse.code} · ${warehouse.name}` : "–"}</div>
            {settings.operator ? <div className="truncate text-[12px] text-white/50">{settings.operator}</div> : null}
          </div>
          <ConnectionBadge />
          <button
            type="button"
            onClick={async () => {
              if (!window.wms) return;
              const next = await window.wms.setFullscreen(!fullscreen);
              setFullscreen(next);
            }}
            className="flex h-11 w-full items-center gap-2.5 rounded-lg px-3 text-left text-[13px] font-medium text-white/80 hover:bg-white/5"
          >
            {fullscreen ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
            <span>{fullscreen ? t("Exit full screen") : t("Full screen")}</span>
          </button>
        </div>
      </aside>
      <main className="flex min-w-0 flex-1 flex-col">
        <div key={location.pathname.split("/")[1]} className="fade-in flex min-h-0 flex-1 flex-col">
          <Outlet />
        </div>
      </main>
    </div>
  );
}

/** Standard page frame: title row + content that fills the remaining height. */
export function Page({ title, subtitle, actions, children, className }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <>
      <header className="flex h-16 shrink-0 items-center justify-between gap-4 border-b border-line bg-panel px-6">
        <div className="min-w-0">
          <h1 className="truncate text-[20px] font-semibold tracking-tight">{title}</h1>
          {subtitle ? <p className="truncate text-[12.5px] text-muted">{subtitle}</p> : null}
        </div>
        {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
      </header>
      <div className={cn("min-h-0 flex-1 overflow-auto p-5", className)}>{children}</div>
    </>
  );
}
