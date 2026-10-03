import { useEffect, useState } from "react";
import { Barcode, Globe, Info, Link2, Printer, Save, Warehouse as WarehouseIcon } from "lucide-react";
import type { HostInfo, PrinterInfo } from "@shared/ipc";
import type { WmsHandshake } from "@shared/api";
import { Page } from "@/app/shell";
import { HttpSource } from "@/data/http";
import { useConnection } from "@/data/provider";
import { cn } from "@/lib/format";
import { useT } from "@/lib/i18n";
import { beep } from "@/lib/scanner";
import { defaultSettings, saveSettings, useSettings, type Settings } from "@/lib/settings";
import { BigButton, Field, Input, Notice, Panel, Pill, ScanInput, Select, Toggle } from "@/ui";
import { useToast } from "@/ui/toast";

const sections = [
  { key: "connection", label: "Connection", icon: Link2 },
  { key: "warehouse", label: "Warehouse & operator", icon: WarehouseIcon },
  { key: "scanner", label: "Scanner", icon: Barcode },
  { key: "printers", label: "Printers", icon: Printer },
  { key: "general", label: "General", icon: Globe },
  { key: "about", label: "About", icon: Info },
] as const;

type SectionKey = (typeof sections)[number]["key"];

export function SettingsPage() {
  const t = useT();
  const toast = useToast();
  const saved = useSettings();
  const connection = useConnection();
  const [draft, setDraft] = useState<Settings>(saved);
  const [section, setSection] = useState<SectionKey>("connection");
  const [printers, setPrinters] = useState<PrinterInfo[]>([]);
  const [host, setHost] = useState<HostInfo | null>(null);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string; handshake?: WmsHandshake } | null>(null);
  const [lastScan, setLastScan] = useState("");

  useEffect(() => {
    window.wms?.printers().then(setPrinters).catch(() => setPrinters([]));
    window.wms?.host().then(setHost).catch(() => setHost(null));
  }, []);

  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);
  const patch = (partial: Partial<Settings>) => setDraft((current) => ({ ...current, ...partial }));

  const save = () => {
    saveSettings(draft);
    toast.ok(t("Settings saved"));
  };

  const test = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const probe = new HttpSource(draft.serverUrl, draft.apiKey, draft.warehouseId);
      const handshake = await probe.handshake();
      setTestResult({ ok: true, message: `${handshake.organization.name} · ${t("{n} warehouses", { n: handshake.warehouses.length })}`, handshake });
      if (!draft.warehouseId) {
        const preferred = handshake.warehouses.find((w) => w.isDefault) ?? handshake.warehouses[0];
        if (preferred) patch({ warehouseId: preferred.id });
      }
    } catch (err) {
      setTestResult({ ok: false, message: (err as Error).message });
    } finally {
      setTesting(false);
    }
  };

  const warehouses = testResult?.handshake?.warehouses ?? connection.handshake?.warehouses ?? [];

  return (
    <Page
      title={t("Settings")}
      subtitle={t("This device")}
      actions={
        <>
          <BigButton size="md" disabled={!dirty} onClick={() => setDraft(saved)}>{t("Discard")}</BigButton>
          <BigButton size="md" variant="primary" icon={Save} disabled={!dirty} onClick={save}>{t("Save")}</BigButton>
        </>
      }
    >
      <div className="grid h-full min-h-0 grid-cols-[300px_minmax(0,1fr)] gap-5">
        <nav className="flex flex-col gap-2">
          {sections.map((item) => {
            const Icon = item.icon;
            const active = section === item.key;
            return (
              <button key={item.key} type="button" onClick={() => setSection(item.key)} className={cn("flex h-16 items-center gap-3 rounded-xl border px-5 text-left text-[16px] font-semibold transition-colors", active ? "border-ink bg-ink text-white" : "border-line bg-panel hover:bg-surface")}>
                <Icon className={cn("size-5", active ? "text-white/80" : "text-muted")} />
                {t(item.label)}
              </button>
            );
          })}
        </nav>

        <div className="min-h-0 overflow-auto">
          {section === "connection" ? (
            <Panel title={t("Connection to the ERP")} description={t("The WMS talks to your Aera ERP through its API")}>
              <div className="max-w-2xl space-y-5">
                <Toggle checked={draft.demo} onChange={(demo) => patch({ demo })} label={t("Use demo data (no server needed)")} />
                <Field label={t("Server URL")} hint={t("e.g. https://your-company.aera.app")}>
                  <Input value={draft.serverUrl} onChange={(e) => patch({ serverUrl: e.target.value })} placeholder="https://" disabled={draft.demo} className="font-mono" />
                </Field>
                <Field label={t("API key")} hint={t("Create one in the ERP under Settings → API. Starts with aera_")}>
                  <Input value={draft.apiKey} onChange={(e) => patch({ apiKey: e.target.value })} placeholder="aera_…" disabled={draft.demo} type="password" className="font-mono" />
                </Field>
                <div className="flex items-center gap-3">
                  <BigButton variant="dark" disabled={draft.demo || testing || !draft.serverUrl || !draft.apiKey} onClick={test}>{testing ? t("Testing…") : t("Test connection")}</BigButton>
                  {testResult ? <Pill tone={testResult.ok ? "ok" : "danger"}>{testResult.message}</Pill> : null}
                </div>
                {!draft.demo ? <Notice tone="info">{t("Pick lists are stored on this device until the ERP gains its own pick-list model. Everything else is read from and written to the ERP live.")}</Notice> : null}
              </div>
            </Panel>
          ) : null}

          {section === "warehouse" ? (
            <Panel title={t("Warehouse & operator")} description={t("Which warehouse this station works for")}>
              <div className="max-w-2xl space-y-5">
                <Field label={t("Warehouse")}>
                  <Select value={draft.warehouseId} onChange={(e) => patch({ warehouseId: e.target.value })}>
                    <option value="">{t("Default warehouse")}</option>
                    {warehouses.map((w) => (
                      <option key={w.id} value={w.id}>{w.code} · {w.name}</option>
                    ))}
                  </Select>
                </Field>
                <Field label={t("Operator name")} hint={t("Shown in the sidebar and sent with bookings")}>
                  <Input value={draft.operator} onChange={(e) => patch({ operator: e.target.value })} />
                </Field>
                <Field label={t("Default carrier")}>
                  <Select value={draft.defaultCarrier} onChange={(e) => patch({ defaultCarrier: e.target.value })}>
                    {["DHL", "DPD", "GLS", "Hermes", "UPS", "FedEx", "Deutsche Post", "Spedition"].map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </Select>
                </Field>
              </div>
            </Panel>
          ) : null}

          {section === "scanner" ? (
            <Panel title={t("Scanner")} description={t("Any keyboard-wedge scanner works out of the box")}>
              <div className="max-w-2xl space-y-5">
                <Field label={t("Suffix sent after each code")}>
                  <Select value={draft.scannerSuffix} onChange={(e) => patch({ scannerSuffix: e.target.value as Settings["scannerSuffix"] })}>
                    <option value="enter">Enter (CR)</option>
                    <option value="tab">Tab</option>
                  </Select>
                </Field>
                <Toggle checked={draft.soundOnScan} onChange={(soundOnScan) => patch({ soundOnScan })} label={t("Beep on success / error")} />
                <Field label={t("Test scan")} hint={t("Scan anything – the decoded value appears below")}>
                  <ScanInput autoFocus={false} onScan={(code) => { setLastScan(code); if (draft.soundOnScan) beep("ok"); }} />
                </Field>
                {lastScan ? <Notice tone="ok">{t("Last scan")}: <span className="font-mono">{lastScan}</span></Notice> : null}
              </div>
            </Panel>
          ) : null}

          {section === "printers" ? (
            <Panel title={t("Printers")} description={t("Printers installed on this computer")}>
              <div className="max-w-2xl space-y-5">
                {(["documents", "labels", "articleLabels"] as const).map((slot) => (
                  <Field key={slot} label={t({ documents: "Documents (A4) – delivery notes, pick lists", labels: "Shipping labels", articleLabels: "Article & bin labels" }[slot])}>
                    <Select value={draft.printers[slot]} onChange={(e) => patch({ printers: { ...draft.printers, [slot]: e.target.value } })}>
                      <option value="">{t("System default")}</option>
                      {printers.map((p) => (
                        <option key={p.name} value={p.name}>{p.displayName}{p.isDefault ? ` · ${t("default")}` : ""}</option>
                      ))}
                    </Select>
                  </Field>
                ))}
                {printers.length === 0 ? <Notice tone="neutral">{t("No printers found. Install them in the operating system and reopen Settings.")}</Notice> : null}
              </div>
            </Panel>
          ) : null}

          {section === "general" ? (
            <Panel title={t("General")}>
              <div className="max-w-2xl space-y-5">
                <Field label={t("Language")}>
                  <Select value={draft.language} onChange={(e) => patch({ language: e.target.value as Settings["language"] })}>
                    <option value="de">Deutsch</option>
                    <option value="en">English</option>
                  </Select>
                </Field>
                <BigButton variant="ghost" onClick={() => setDraft({ ...defaultSettings, language: draft.language })}>{t("Reset to defaults")}</BigButton>
              </div>
            </Panel>
          ) : null}

          {section === "about" ? (
            <Panel title="Aera WMS">
              <dl className="grid max-w-2xl grid-cols-[200px_1fr] gap-y-3 text-[15px]">
                <dt className="text-muted">{t("Version")}</dt>
                <dd className="font-mono">{host?.version ?? "dev"}</dd>
                <dt className="text-muted">{t("Platform")}</dt>
                <dd className="font-mono">{host ? `${host.platform} ${host.arch}` : "browser"}</dd>
                <dt className="text-muted">{t("Device")}</dt>
                <dd className="font-mono">{host?.hostname ?? "–"}</dd>
                <dt className="text-muted">{t("Connection")}</dt>
                <dd>{connection.state === "demo" ? t("Demo data") : connection.state === "online" ? t("Connected") : connection.state === "offline" ? t("Offline") : t("Connecting…")}</dd>
              </dl>
              <p className="mt-6 max-w-2xl text-[13px] text-muted">{t("Updates are published on the Downloads page of your ERP (Settings → Downloads).")}</p>
            </Panel>
          ) : null}
        </div>
      </div>
    </Page>
  );
}
