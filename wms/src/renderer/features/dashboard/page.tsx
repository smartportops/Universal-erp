import { Link } from "react-router-dom";
import { AlertTriangle, ArrowDownToLine, ClipboardList, PackageCheck, PauseCircle, Undo2 } from "lucide-react";
import { useData, useLoad } from "@/data/provider";
import { Page } from "@/app/shell";
import { formatNumber, shortDay } from "@/lib/format";
import { useT } from "@/lib/i18n";
import { useSettings } from "@/lib/settings";
import { Bars, BigButton, EmptyState, Notice, Panel, Stat } from "@/ui";

export function DashboardPage() {
  const t = useT();
  const source = useData();
  const { language } = useSettings();
  const { data, error, loading, reload } = useLoad(() => source.dashboard(), [source]);

  return (
    <Page title={t("Dashboard")} subtitle={t("Today in the warehouse")} actions={<BigButton size="md" onClick={reload}>{t("Refresh")}</BigButton>}>
      {error ? <Notice tone="danger" className="mb-4">{error}</Notice> : null}
      {!data && loading ? <EmptyState title={t("Loading…")} /> : null}
      {data ? (
        <div className="space-y-5">
          <div className="grid grid-cols-3 gap-4 2xl:grid-cols-6">
            <Stat label={t("Open purchase orders")} value={formatNumber(data.openPurchaseOrders, language)} icon={ArrowDownToLine} tone="info" />
            <Stat label={t("Orders to pick")} value={formatNumber(data.openOrders, language)} icon={ClipboardList} tone="warn" />
            <Stat label={t("On hold")} value={formatNumber(data.onHoldOrders, language)} icon={PauseCircle} tone="danger" />
            <Stat label={t("Shipped (7 days)")} value={formatNumber(data.shipped7d, language)} icon={PackageCheck} tone="ok" />
            <Stat label={t("Returns (7 days)")} value={formatNumber(data.returns7d, language)} icon={Undo2} />
            <Stat label={t("Low stock articles")} value={formatNumber(data.lowStock, language)} icon={AlertTriangle} tone={data.lowStock > 0 ? "warn" : "neutral"} />
          </div>

          <div className="grid grid-cols-2 gap-5">
            <Panel title={t("Shipped packages")} description={t("Last 7 days")}>
              <Bars data={data.days.map((day) => ({ label: shortDay(day.date, language), value: day.shipped }))} />
            </Panel>
            <Panel title={t("Received units")} description={t("Last 7 days")}>
              <Bars data={data.days.map((day) => ({ label: shortDay(day.date, language), value: day.received }))} color="bg-info" />
            </Panel>
          </div>

          <Panel title={t("Quick start")}>
            <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
              <Link to="/receiving"><BigButton block size="xl" icon={ArrowDownToLine} hint="F2">{t("Goods receipt")}</BigButton></Link>
              <Link to="/picklists"><BigButton block size="xl" icon={ClipboardList} hint="F3">{t("Pick lists")}</BigButton></Link>
              <Link to="/fastship"><BigButton block size="xl" icon={PackageCheck} hint="F4" variant="primary">{t("Fast Ship")}</BigButton></Link>
              <Link to="/returns"><BigButton block size="xl" icon={Undo2} hint="F6">{t("Returns")}</BigButton></Link>
            </div>
          </Panel>
        </div>
      ) : null}
    </Page>
  );
}
