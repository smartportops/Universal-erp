import { useState } from "react";
import { Grid2x2Plus, Printer } from "lucide-react";
import { useData, useLoad } from "@/data/provider";
import { useT } from "@/lib/i18n";
import { BigButton, EmptyState, Field, Input, Notice, Panel, Pill, Select, Table, Td, Th } from "@/ui";
import { useToast } from "@/ui/toast";

const types = ["shelf", "pallet", "receiving", "packing", "returns", "condition", "bulk"];

export function BinsTool() {
  const t = useT();
  const source = useData();
  const toast = useToast();
  const bins = useLoad(() => source.bins(), [source]);
  const [form, setForm] = useState({ code: "", name: "", type: "shelf" });
  const [busy, setBusy] = useState(false);

  const create = async () => {
    if (!form.code.trim()) return;
    setBusy(true);
    try {
      await source.createBin({ warehouseId: bins.data?.[0]?.warehouseId ?? "", code: form.code.trim().toUpperCase(), name: form.name.trim() || form.code.trim().toUpperCase(), type: form.type });
      toast.ok(t("Bin created"), form.code.toUpperCase());
      setForm({ code: "", name: "", type: form.type });
      bins.reload();
    } catch (err) {
      toast.error(t("Could not create bin"), (err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid h-full min-h-0 grid-cols-[minmax(0,1fr)_380px] gap-5">
      <Panel title={t("Bins")} description={t("{n} bins", { n: bins.data?.length ?? 0 })} flush>
        {bins.error ? <Notice tone="danger" className="m-4">{bins.error}</Notice> : null}
        {bins.data && bins.data.length === 0 ? <EmptyState title={t("No bins yet")} /> : null}
        {bins.data && bins.data.length > 0 ? (
          <Table>
            <thead>
              <tr>
                <Th>{t("Code")}</Th>
                <Th>{t("Name")}</Th>
                <Th>{t("Type")}</Th>
                <Th align="right">{t("Articles")}</Th>
                <Th align="right">{t("Units")}</Th>
                <Th align="right">{t("Status")}</Th>
              </tr>
            </thead>
            <tbody>
              {bins.data.map((bin) => (
                <tr key={bin.id}>
                  <Td mono className="font-semibold">{bin.code}</Td>
                  <Td>{bin.name}</Td>
                  <Td><Pill>{t(bin.type)}</Pill></Td>
                  <Td align="right" mono>{bin.articles}</Td>
                  <Td align="right" mono>{bin.units}</Td>
                  <Td align="right"><Pill tone={bin.active ? "ok" : "neutral"}>{bin.active ? t("active") : t("inactive")}</Pill></Td>
                </tr>
              ))}
            </tbody>
          </Table>
        ) : null}
      </Panel>
      <div className="flex flex-col gap-5">
        <Panel title={t("New bin")}>
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              void create();
            }}
          >
            <Field label={t("Code")} hint={t("e.g. A-01-03 – printed on the bin label")}>
              <Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} className="font-mono uppercase" required />
            </Field>
            <Field label={t("Name")}>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder={t("Optional")} />
            </Field>
            <Field label={t("Type")}>
              <Select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                {types.map((type) => (
                  <option key={type} value={type}>{t(type)}</option>
                ))}
              </Select>
            </Field>
            <BigButton block type="submit" variant="primary" icon={Grid2x2Plus} disabled={busy}>{t("Create bin")}</BigButton>
          </form>
        </Panel>
        <Panel title={t("Labels")}>
          <BigButton block icon={Printer} disabled>{t("Print bin labels")}</BigButton>
          <p className="mt-3 text-[13px] text-muted">{t("Label printing uses the label printer from Settings.")}</p>
        </Panel>
      </div>
    </div>
  );
}
