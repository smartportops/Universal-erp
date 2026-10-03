import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { CheckCircle2, ClipboardList, PackageCheck, Play, Plus, Trash2 } from "lucide-react";
import type { WmsOrder, WmsPickProfile } from "@shared/api";
import { Page } from "@/app/shell";
import { useData, useLoad } from "@/data/provider";
import { eligibleOrders, type PickList } from "@/data/source";
import { cn, formatWhen, sum } from "@/lib/format";
import { useT } from "@/lib/i18n";
import { useScanner } from "@/lib/scanner";
import { useSettings } from "@/lib/settings";
import { BigButton, Done, EmptyState, Modal, Notice, Panel, Pill, Progress, ScanInput, statusTone, Table, Td, Th } from "@/ui";
import { useToast } from "@/ui/toast";

type Aggregated = { variantId: string; sku: string; ean: string; name: string; quantity: number; bins: string; orders: number };

/** Sum the lines of all orders on a list into one pick run, sorted by bin. */
export function aggregate(list: PickList, orders: WmsOrder[]): Aggregated[] {
  const map = new Map<string, Aggregated>();
  for (const order of orders) {
    if (!list.orderIds.includes(order.id)) continue;
    for (const line of order.lines) {
      const open = line.quantity - line.shipped;
      if (open <= 0) continue;
      const entry = map.get(line.variantId) ?? { variantId: line.variantId, sku: line.sku, ean: line.ean, name: line.name, quantity: 0, bins: line.bins.map((b) => b.binCode).join(", ") || "–", orders: 0 };
      entry.quantity += open;
      entry.orders += 1;
      map.set(line.variantId, entry);
    }
  }
  return [...map.values()].sort((a, b) => a.bins.localeCompare(b.bins));
}

export function PickListsPage() {
  const t = useT();
  const source = useData();
  const toast = useToast();
  const { language, scannerSuffix } = useSettings();
  const lists = useLoad(() => source.pickLists(), [source]);
  const orders = useLoad(() => source.openOrders(), [source]);
  const profiles = useLoad(() => source.pickProfiles(), [source]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);

  const selected = lists.data?.find((l) => l.id === selectedId) ?? null;
  const items = useMemo(() => (selected && orders.data ? aggregate(selected, orders.data) : []), [selected, orders.data]);
  const totalQty = sum(items.map((i) => i.quantity));
  const pickedQty = selected ? sum(items.map((i) => Math.min(i.quantity, selected.picked[i.variantId] ?? 0))) : 0;

  const persist = async (list: PickList) => {
    await source.updatePickList(list);
    lists.setData((current) => (current ?? []).map((l) => (l.id === list.id ? list : l)));
  };

  const create = async (profile: WmsPickProfile) => {
    if (!orders.data) return;
    const candidates = eligibleOrders(orders.data, profile, lists.data ?? [])
      .sort((a, b) => (a.priority === "high" ? -1 : b.priority === "high" ? 1 : a.placedAt.localeCompare(b.placedAt)))
      .slice(0, profile.maxOrders);
    if (candidates.length === 0) {
      toast.error(t("No matching orders"), profile.name);
      return;
    }
    setBusy(true);
    try {
      const list = await source.createPickList(profile, candidates.map((o) => o.id));
      lists.setData((current) => [list, ...(current ?? [])]);
      setSelectedId(list.id);
      setCreating(false);
      toast.ok(t("Pick list created"), `${list.number} · ${t("{n} orders", { n: candidates.length })}`);
    } finally {
      setBusy(false);
    }
  };

  const start = async () => {
    if (!selected) return;
    setBusy(true);
    try {
      await Promise.all(selected.orderIds.map((id) => source.startPicking(id)));
      await persist({ ...selected, status: "picking" });
      toast.ok(t("Picking started"), selected.number);
    } finally {
      setBusy(false);
    }
  };

  const finish = async () => {
    if (!selected) return;
    await persist({ ...selected, status: "picked" });
    toast.ok(t("Pick list complete"), selected.number);
  };

  const remove = async () => {
    if (!selected) return;
    await source.deletePickList(selected.id);
    lists.setData((current) => (current ?? []).filter((l) => l.id !== selected.id));
    setSelectedId(null);
  };

  const scan = (code: string) => {
    if (!selected || selected.status === "picked" || selected.status === "shipped") return;
    const item = items.find((i) => i.sku.toLowerCase() === code.toLowerCase() || i.ean === code);
    if (!item) {
      toast.error(t("Article is not on this pick list"), code);
      return;
    }
    const current = selected.picked[item.variantId] ?? 0;
    if (current >= item.quantity) {
      toast.error(t("Already fully picked"), item.sku);
      return;
    }
    const next = { ...selected, status: "picking" as const, picked: { ...selected.picked, [item.variantId]: current + 1 } };
    void persist(next);
    if (current + 1 === item.quantity) toast.ok(t("Position complete"), item.sku);
  };
  useScanner(scan, { suffix: scannerSuffix });

  return (
    <Page
      title={t("Pick lists")}
      subtitle={t("Group orders into picking runs, pick, then pack in Fast Ship")}
      actions={
        <>
          <BigButton size="md" onClick={() => { lists.reload(); orders.reload(); }}>{t("Refresh")}</BigButton>
          <BigButton size="md" variant="primary" icon={Plus} onClick={() => setCreating(true)}>{t("New pick list")}</BigButton>
        </>
      }
    >
      {lists.error || orders.error ? <Notice tone="danger" className="mb-4">{lists.error ?? orders.error}</Notice> : null}
      <div className="grid h-full min-h-0 grid-cols-[380px_minmax(0,1fr)_380px] gap-5">
        <Panel title={t("Pick lists")} description={t("{n} lists", { n: lists.data?.length ?? 0 })} flush>
          {lists.data && lists.data.length === 0 ? (
            <EmptyState icon={ClipboardList} title={t("No pick lists yet")} body={t("Create one from a profile – orders are taken from the ERP automatically.")} action={<BigButton variant="primary" icon={Plus} onClick={() => setCreating(true)}>{t("New pick list")}</BigButton>} />
          ) : null}
          {lists.data?.map((list) => (
            <button key={list.id} type="button" onClick={() => setSelectedId(list.id)} className={cn("touch-row", list.id === selectedId && "bg-accent-soft")}>
              <div className="min-w-0 flex-1 py-3">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[15px] font-semibold">{list.number}</span>
                  <Pill tone={statusTone(list.status)}>{t(list.status)}</Pill>
                </div>
                <div className="truncate text-[14px] text-muted">{list.profileName} · {list.carrier}</div>
                <div className="text-[12.5px] text-faint">{formatWhen(list.createdAt, language)}</div>
              </div>
              <div className="text-right">
                <div className="text-[20px] font-semibold tabular-nums">{list.orderIds.length}</div>
                <div className="text-[11.5px] text-faint">{t("orders")}</div>
              </div>
            </button>
          ))}
        </Panel>

        <Panel
          title={selected ? `${selected.number} · ${selected.profileName}` : t("Pick run")}
          description={selected ? t("{picked} of {total} units picked", { picked: pickedQty, total: totalQty }) : t("Select a list to see its positions")}
          actions={selected ? <BigButton size="md" variant="ghost" icon={Trash2} onClick={remove}>{t("Delete")}</BigButton> : undefined}
          flush
        >
          {selected ? (
            <div className="flex h-full flex-col">
              <div className="space-y-4 border-b border-line p-5">
                <ScanInput onScan={scan} placeholder={t("Scan picked article")} disabled={selected.status === "picked" || selected.status === "shipped"} />
                <Progress value={pickedQty} max={totalQty} />
                <div className="grid grid-cols-2 gap-3">
                  {selected.status === "open" ? (
                    <BigButton size="xl" variant="primary" icon={Play} disabled={busy} onClick={start}>{t("Start picking")}</BigButton>
                  ) : selected.status === "picking" ? (
                    <BigButton size="xl" variant="primary" icon={CheckCircle2} disabled={busy} onClick={finish}>{t("Finish picking")}</BigButton>
                  ) : (
                    <Link to="/fastship" className="contents"><BigButton block size="xl" variant="dark" icon={PackageCheck} hint="F4">{t("Pack in Fast Ship")}</BigButton></Link>
                  )}
                  <BigButton size="xl" disabled>{t("Print pick list")}</BigButton>
                </div>
              </div>
              <Table>
                <thead>
                  <tr>
                    <Th>{t("Bin")}</Th>
                    <Th>{t("Article")}</Th>
                    <Th align="right">{t("Qty")}</Th>
                    <Th align="right">{t("Picked")}</Th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => {
                    const picked = selected.picked[item.variantId] ?? 0;
                    return (
                      <tr key={item.variantId} className={cn(picked >= item.quantity && "bg-accent-soft/50")}>
                        <Td mono>{item.bins}</Td>
                        <Td>
                          <div className="font-medium leading-tight">{item.name}</div>
                          <div className="font-mono text-[12.5px] text-muted">{item.sku} · {t("{n} orders", { n: item.orders })}</div>
                        </Td>
                        <Td align="right" mono>{item.quantity}</Td>
                        <Td align="right">{picked >= item.quantity ? <Done /> : <span className="font-mono text-[15px]">{picked}</span>}</Td>
                      </tr>
                    );
                  })}
                </tbody>
              </Table>
            </div>
          ) : (
            <EmptyState icon={ClipboardList} title={t("No pick list selected")} />
          )}
        </Panel>

        <Panel title={t("Orders on list")} description={selected ? t("{n} orders", { n: selected.orderIds.length }) : undefined} flush>
          {selected && orders.data ? (
            orders.data
              .filter((o) => selected.orderIds.includes(o.id))
              .map((order) => (
                <div key={order.id} className="touch-row">
                  <div className="min-w-0 flex-1 py-3">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-semibold">{order.number}</span>
                      {order.priority === "high" ? <Pill tone="danger">{t("Priority")}</Pill> : null}
                      {selected.shippedOrderIds.includes(order.id) ? <Pill tone="ok">{t("shipped")}</Pill> : null}
                    </div>
                    <div className="truncate text-[14px] text-muted">{order.customer.company || order.customer.name} · {order.shipTo.city}</div>
                  </div>
                  <div className="text-right text-[14px] tabular-nums text-muted">{sum(order.lines.map((l) => l.quantity - l.shipped))} {t("units")}</div>
                </div>
              ))
          ) : (
            <EmptyState title={t("Orders appear here")} />
          )}
        </Panel>
      </div>

      <Modal open={creating} onClose={() => setCreating(false)} title={t("New pick list")}>
        <p className="mb-4 text-[14px] text-muted">{t("Profiles are configured in the ERP (Settings → WMS). Each profile pulls matching open orders.")}</p>
        <div className="space-y-3">
          {profiles.data?.map((profile) => {
            const count = orders.data ? eligibleOrders(orders.data, profile, lists.data ?? []).length : 0;
            return (
              <button key={profile.id} type="button" disabled={busy || count === 0} onClick={() => create(profile)} className="flex min-h-20 w-full items-center gap-4 rounded-xl border border-line px-5 text-left hover:bg-surface disabled:opacity-40">
                <div className="min-w-0 flex-1">
                  <div className="text-[16px] font-semibold">{profile.name}</div>
                  <div className="text-[13px] text-muted">
                    {profile.channel ? `${t("Channel")}: ${profile.channel} · ` : ""}
                    {profile.customerType ? `${profile.customerType.toUpperCase()} · ` : ""}
                    {t("max. {n} orders", { n: profile.maxOrders })} · {profile.carrier}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-[22px] font-semibold tabular-nums">{Math.min(count, profile.maxOrders)}</div>
                  <div className="text-[11.5px] text-faint">{t("of {n} eligible", { n: count })}</div>
                </div>
              </button>
            );
          })}
          {profiles.data && profiles.data.length === 0 ? <Notice tone="warn">{t("No pick profiles configured in the ERP yet.")}</Notice> : null}
        </div>
      </Modal>
    </Page>
  );
}
