import { prisma } from "@/lib/db";
import { money, qty, signedQty } from "@/lib/format";
import { dictionary } from "@/i18n/dictionary";
import { translate } from "@/lib/i18n";
import { getLocale } from "@/lib/i18n-server";
import { searchRecords } from "@/server/search";
import { getSnapshot, needsReorder, type BalanceRow } from "@/server/snapshot";

export type AssistantLink = { href: string; label: string; meta?: string };
export type AssistantAnswer = { title: string; body: string; links: AssistantLink[] };

type Intent =
  | { kind: "late_orders" }
  | { kind: "negative_stock"; sku?: string }
  | { kind: "reorder" }
  | { kind: "digest" }
  | { kind: "find"; query: string }
  | { kind: "unknown" };

type Tx = (text: string, vars?: Record<string, string | number>) => string;

// interpret() is the seam a model can replace. The tools below stay.
export function interpret(message: string): Intent {
  const text = message.toLowerCase();
  const sku = message.match(/\b[A-Z]{2,5}-[A-Z0-9]+(?:-[A-Z0-9]+)*\b/)?.[0];
  if (/verspät|verspaet|überfäll|ueberfaell|in verzug|zu spät|zu spaet|\blate\b|\boverdue\b/.test(text)) return { kind: "late_orders" };
  if (/negativ|unter null|warum ist der bestand|zu wenig bestand|\bnegative\b|below zero/.test(text)) return { kind: "negative_stock", sku };
  if (/nachbestell|meldebestand|reorder|nachschub|bestellen wir/.test(text)) return { kind: "reorder" };
  if (/problem|zusammenfass|was liegt an|heute|\bsummary\b|\btoday\b|\bproblems\b/.test(text) && !sku) return { kind: "digest" };
  if (sku && /bestand|warum|artikel|\bstock\b|\bwhy\b|\bitem\b|\bproduct\b/.test(text)) return { kind: "negative_stock", sku };
  const token = message.match(/\b(?:SO|PO|SH|INV|RT)-\d+\b|\b\d{12,22}\b/);
  if (token) return { kind: "find", query: token[0] };
  if (text.trim().length >= 2) return { kind: "find", query: message.trim() };
  return { kind: "unknown" };
}

async function explainVariant(organizationId: string, row: BalanceRow, t: Tx): Promise<string> {
  const movements = await prisma.stockMovement.findMany({
    where: { organizationId, variantId: row.variantId },
    orderBy: { createdAt: "asc" },
  });
  let running = 0;
  const lines = movements.map((movement) => {
    running += movement.quantity;
    const label = movement.referenceLabel || movement.type;
    return `${signedQty(movement.quantity)} ${label} -> ${qty(running)}`;
  });
  const received = movements.filter((movement) => movement.quantity > 0).reduce((sum, movement) => sum + movement.quantity, 0);
  const issued = movements.filter((movement) => movement.quantity < 0).reduce((sum, movement) => sum + movement.quantity, 0);
  const supplier = row.supplierName
    ? t(" Supplier {name}{lead}.", {
        name: row.supplierName,
        lead: row.leadTimeDays ? t(", lead time {days} days", { days: row.leadTimeDays }) : "",
      })
    : "";
  const demand = row.openDemand > 0 ? t(" Open on orders: {qty}.", { qty: qty(row.openDemand) }) : "";
  const incoming = row.incoming > 0 ? t(" Incoming on purchase orders: {qty}.", { qty: qty(row.incoming) }) : t(" No open purchase order.");
  return [
    t("{name} ({sku}) has stock {onHand}.", { name: row.productName, sku: row.sku, onHand: qty(row.onHand) }),
    t("Received {received}, issued {issued}. That is the sum of movements, not a display error.", { received: qty(received), issued: qty(Math.abs(issued)) }),
    demand + incoming + supplier,
    lines.length ? `\n${lines.join("\n")}` : "",
  ].join(" ");
}

export async function answerQuestion(organizationId: string, message: string): Promise<AssistantAnswer> {
  const locale = await getLocale();
  const t: Tx = (text, vars) => translate(locale, text, dictionary, vars);
  const intent = interpret(message);
  const snapshot = await getSnapshot(organizationId);

  if (intent.kind === "late_orders") {
    if (snapshot.lateOrders.length === 0) {
      return { title: t("No late orders"), body: t("Everything with a delivery promise is either shipped or still on time."), links: [] };
    }
    return {
      title: t("{n} late orders", { n: snapshot.lateOrders.length }),
      body: t("Confirmed, picking, or partially shipped, and the delivery date is before today."),
      links: snapshot.lateOrders.map((order) => ({
        href: `/sales-orders/${order.id}`,
        label: order.number,
        meta: order.customer.name,
      })),
    };
  }

  if (intent.kind === "negative_stock") {
    const rows = intent.sku
      ? snapshot.balances.filter((row) => row.sku === intent.sku)
      : snapshot.negative;
    if (intent.sku && rows.length === 0) {
      return { title: t("Item not found"), body: t("{sku} does not exist in this company.", { sku: intent.sku }), links: [] };
    }
    if (rows.length === 0) {
      return { title: t("No negative stock"), body: t("No item is below zero."), links: [] };
    }
    const bodies = await Promise.all(rows.map((row) => explainVariant(organizationId, row, t)));
    return {
      title: rows.length === 1 ? t("Explain {sku}", { sku: rows[0].sku }) : t("Stock below zero"),
      body: bodies.join("\n\n"),
      links: rows.map((row) => ({ href: `/products/${row.productId}`, label: row.sku, meta: row.productName })),
    };
  }

  if (intent.kind === "reorder") {
    const rows = snapshot.balances.filter(needsReorder);
    if (rows.length === 0) {
      return { title: t("Nothing to reorder"), body: t("Reorder points are covered, including open purchases."), links: [] };
    }
    return {
      title: t("{n} items to reorder", { n: rows.length }),
      body: rows
        .map((row) => {
          const supplier = row.supplierName ? t(" from {supplier}", { supplier: row.supplierName }) : "";
          const lead = row.leadTimeDays ? t(", {days} days", { days: row.leadTimeDays }) : "";
          return t("{sku}: on hand {onHand}, reorder point {point}, suggestion {qty}{supplier}{lead}.", {
            sku: row.sku,
            onHand: qty(row.onHand),
            point: qty(row.reorderPoint),
            qty: qty(row.reorderQty || row.reorderPoint),
            supplier,
            lead,
          });
        })
        .join("\n"),
      links: rows.map((row) => ({ href: `/products/${row.productId}`, label: row.sku, meta: t("On hand {qty}", { qty: qty(row.onHand) }) })),
    };
  }

  if (intent.kind === "digest") {
    const bits = [
      snapshot.lateOrders.length ? t("{n} late orders", { n: snapshot.lateOrders.length }) : null,
      snapshot.negative.length ? t("{n} items below zero", { n: snapshot.negative.length }) : null,
      snapshot.reorder.length ? t("{n} reorders", { n: snapshot.reorder.length }) : null,
      snapshot.overdueInvoices.length ? t("{n} overdue invoices", { n: snapshot.overdueInvoices.length }) : null,
      snapshot.overduePurchases.length ? t("{n} overdue purchases", { n: snapshot.overduePurchases.length }) : null,
    ].filter(Boolean);
    return {
      title: bits.length ? t("What is on today") : t("A quiet day"),
      body: bits.length
        ? t("Operationally open: {bits}. Revenue this month {revenue}, open items {unpaid}.", {
            bits: bits.join(", "),
            revenue: money(snapshot.kpis.revenueMonth),
            unpaid: money(snapshot.kpis.unpaid),
          })
        : t("No late orders, no negative stock, no overdue documents."),
      links: snapshot.problems.slice(0, 6).map((problem) => ({
        href: problem.href,
        label: problem.title,
        meta: problem.meta,
      })),
    };
  }

  if (intent.kind === "find") {
    const hits = await searchRecords(organizationId, intent.query);
    if (hits.length === 0) {
      return unknown(t);
    }
    return {
      title: t('Results for "{query}"', { query: intent.query }),
      body: t("Straight from orders, items, customers, suppliers, serial numbers and tracking numbers."),
      links: hits.slice(0, 8).map((hit) => ({ href: hit.href, label: hit.label, meta: `${hit.group} · ${hit.hint}` })),
    };
  }

  return unknown(t);
}

function unknown(t: Tx): AssistantAnswer {
  return {
    title: t("I have no query for that"),
    body: t("I read this company's operational data. Ask, for example, about late orders, negative stock, reorders, or a summary of today's problems."),
    links: [],
  };
}
