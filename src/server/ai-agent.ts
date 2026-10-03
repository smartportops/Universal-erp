import { prisma } from "@/lib/db";
import { can, type Permission } from "@/lib/permissions";
import { money, qty } from "@/lib/format";
import { openSeal } from "@/lib/secret";
import { record } from "@/server/domain/platform";
import { createPurchaseOrder } from "@/server/domain/commerce";
import { setOrderHold, setOrderPriority } from "@/server/domain/documents";
import { searchRecords } from "@/server/search";
import { getSnapshot } from "@/server/snapshot";
import type { AssistantAnswer, AssistantLink } from "@/server/assistant";

type Actor = { organizationId: string; actorId: string; role: string };
type Tool = { name: string; description: string; parameters: Record<string, unknown> };

const tools: Tool[] = [
  { name: "overview", description: "Operational snapshot: late orders, negative stock, overdue invoices, revenue.", parameters: { type: "object", properties: {}, additionalProperties: false } },
  { name: "search", description: "Search products, customers, suppliers, orders, invoices and purchase orders in this company.", parameters: { type: "object", properties: { query: { type: "string" } }, required: ["query"], additionalProperties: false } },
  { name: "list_products", description: "List products and variants, optionally filtered by a name or SKU fragment.", parameters: { type: "object", properties: { query: { type: "string" } }, additionalProperties: false } },
  { name: "rename_products", description: "Rename products by SKU. This changes the product name, which is allowed because a person could edit it. Never use this on invoices.", parameters: { type: "object", properties: { items: { type: "array", items: { type: "object", properties: { sku: { type: "string" }, name: { type: "string" } }, required: ["sku", "name"] } } }, required: ["items"], additionalProperties: false } },
  { name: "update_customer", description: "Update a customer's name, email, phone, company, street, postal code, city or notes.", parameters: { type: "object", properties: { customer: { type: "string" }, name: { type: "string" }, email: { type: "string" }, phone: { type: "string" }, company: { type: "string" }, street: { type: "string" }, postalCode: { type: "string" }, city: { type: "string" }, notes: { type: "string" } }, required: ["customer"], additionalProperties: false } },
  { name: "create_supplier", description: "Create a supplier when one does not exist yet.", parameters: { type: "object", properties: { name: { type: "string" }, email: { type: "string" }, city: { type: "string" } }, required: ["name"], additionalProperties: false } },
  { name: "create_purchase_draft", description: "Create a draft purchase order from supplier invoice lines. Does not order or receive goods. unitCost is euros, for example 12.5.", parameters: { type: "object", properties: { supplier: { type: "string" }, notes: { type: "string" }, lines: { type: "array", items: { type: "object", properties: { sku: { type: "string" }, quantity: { type: "number" }, unitCost: { type: "number" } }, required: ["sku", "quantity"] } } }, required: ["supplier", "lines"], additionalProperties: false } },
  { name: "set_order_priority", description: "Set a sales order priority to low, normal, high or urgent.", parameters: { type: "object", properties: { number: { type: "string" }, priority: { type: "string" } }, required: ["number", "priority"], additionalProperties: false } },
  { name: "hold_order", description: "Put a sales order on hold or release it.", parameters: { type: "object", properties: { number: { type: "string" }, hold: { type: "boolean" } }, required: ["number", "hold"], additionalProperties: false } },
];

function allow(actor: Actor, permission: Permission) {
  if (!can(actor.role, permission)) throw new Error("This user is not allowed to change that.");
}

async function findCustomer(organizationId: string, token: string) {
  return prisma.customer.findFirst({
    where: { organizationId, OR: [{ id: token }, { code: token }, { name: { contains: token, mode: "insensitive" } }, { email: { equals: token, mode: "insensitive" } }] },
  });
}

async function runTool(actor: Actor, name: string, args: Record<string, unknown>): Promise<{ text: string; links: AssistantLink[] }> {
  const links: AssistantLink[] = [];
  if (name === "overview") {
    const snapshot = await getSnapshot(actor.organizationId);
    return {
      text: [
        `Revenue this month ${money(snapshot.kpis.revenueMonth)}, unpaid ${money(snapshot.kpis.unpaid)}.`,
        `Late orders ${snapshot.lateOrders.length}, negative stock ${snapshot.negative.length}, reorders ${snapshot.reorder.length}, overdue invoices ${snapshot.overdueInvoices.length}.`,
        snapshot.lateOrders.map((order) => `${order.number} ${order.customer.name}`).join("\n"),
      ].filter(Boolean).join("\n"),
      links: snapshot.problems.slice(0, 8).map((problem) => ({ href: problem.href, label: problem.title, meta: problem.meta })),
    };
  }
  if (name === "search") {
    const hits = await searchRecords(actor.organizationId, String(args.query ?? ""));
    return {
      text: hits.length ? hits.map((hit) => `${hit.label} ${hit.hint} ${hit.href}`).join("\n") : "Nothing found.",
      links: hits.slice(0, 8).map((hit) => ({ href: hit.href, label: hit.label, meta: hit.hint })),
    };
  }
  if (name === "list_products") {
    const query = String(args.query ?? "").trim();
    const products = await prisma.product.findMany({
      where: {
        organizationId: actor.organizationId,
        ...(query ? { OR: [{ name: { contains: query, mode: "insensitive" } }, { variants: { some: { sku: { contains: query, mode: "insensitive" } } } }] } : {}),
      },
      include: { variants: true },
      take: 30,
      orderBy: { name: "asc" },
    });
    return {
      text: products.map((product) => `${product.name}: ${product.variants.map((variant) => `${variant.sku} (${variant.name})`).join(", ")}`).join("\n") || "No products.",
      links: products.slice(0, 8).map((product) => ({ href: `/products/${product.id}`, label: product.name })),
    };
  }
  if (name === "rename_products") {
    allow(actor, "catalog.write");
    const items = Array.isArray(args.items) ? args.items : [];
    if (items.length === 0 || items.length > 50) throw new Error("Pass between 1 and 50 renames.");
    const done: string[] = [];
    for (const item of items) {
      const sku = String((item as { sku?: string }).sku ?? "").trim();
      const next = String((item as { name?: string }).name ?? "").trim();
      if (!sku || !next) throw new Error("Each rename needs a SKU and a name.");
      const variant = await prisma.productVariant.findFirst({ where: { organizationId: actor.organizationId, sku }, include: { product: true } });
      if (!variant) throw new Error(`SKU ${sku} was not found.`);
      await prisma.product.update({ where: { id: variant.productId }, data: { name: next } });
      await prisma.$transaction((tx) => record(tx, {
        organizationId: actor.organizationId,
        actorId: actor.actorId,
        type: "product.renamed",
        entityType: "product",
        entityId: variant.productId,
        summary: `${sku} renamed to ${next}`,
      }));
      done.push(`${sku}: ${variant.product.name} → ${next}`);
      links.push({ href: `/products/${variant.productId}`, label: next, meta: sku });
    }
    return { text: done.join("\n"), links };
  }
  if (name === "update_customer") {
    allow(actor, "sales.write");
    const customer = await findCustomer(actor.organizationId, String(args.customer ?? ""));
    if (!customer) throw new Error("Customer not found.");
    const data: Record<string, string> = {};
    for (const key of ["name", "email", "phone", "company", "street", "postalCode", "city", "notes"]) {
      if (typeof args[key] === "string") data[key] = String(args[key]).trim();
    }
    if (data.name === "") throw new Error("Name cannot be empty.");
    if (Object.keys(data).length === 0) throw new Error("Nothing to change.");
    await prisma.customer.update({ where: { id: customer.id }, data });
    await prisma.$transaction((tx) => record(tx, {
      organizationId: actor.organizationId,
      actorId: actor.actorId,
      type: "customer.updated",
      entityType: "customer",
      entityId: customer.id,
      summary: `${customer.name} updated by the assistant`,
    }));
    return { text: `Updated ${customer.name}.`, links: [{ href: `/customers/${customer.id}`, label: data.name || customer.name }] };
  }
  if (name === "create_supplier") {
    allow(actor, "purchasing.write");
    const name = String(args.name ?? "").trim();
    if (!name) throw new Error("Supplier name is missing.");
    const existing = await prisma.supplier.findFirst({ where: { organizationId: actor.organizationId, name: { equals: name, mode: "insensitive" } } });
    if (existing) return { text: `Supplier ${existing.name} already exists (${existing.code}).`, links: [{ href: `/suppliers/${existing.id}`, label: existing.name }] };
    const count = await prisma.supplier.count({ where: { organizationId: actor.organizationId } });
    const supplier = await prisma.supplier.create({
      data: {
        organizationId: actor.organizationId,
        name,
        code: `LF-${String(count + 1).padStart(3, "0")}`,
        email: String(args.email ?? ""),
        city: String(args.city ?? ""),
      },
    });
    await prisma.$transaction((tx) => record(tx, {
      organizationId: actor.organizationId,
      actorId: actor.actorId,
      type: "supplier.created",
      entityType: "supplier",
      entityId: supplier.id,
      summary: `${supplier.name} created by the assistant`,
    }));
    return { text: `Created supplier ${supplier.name} (${supplier.code}).`, links: [{ href: `/suppliers/${supplier.id}`, label: supplier.name }] };
  }
  if (name === "create_purchase_draft") {
    allow(actor, "purchasing.write");
    const supplierToken = String(args.supplier ?? "").trim();
    const supplier = await prisma.supplier.findFirst({
      where: { organizationId: actor.organizationId, OR: [{ id: supplierToken }, { code: supplierToken }, { name: { contains: supplierToken, mode: "insensitive" } }] },
    });
    if (!supplier) throw new Error(`Supplier “${supplierToken}” was not found. Create the supplier first.`);
    const warehouse = await prisma.warehouse.findFirst({ where: { organizationId: actor.organizationId, isDefault: true } })
      ?? await prisma.warehouse.findFirst({ where: { organizationId: actor.organizationId } });
    if (!warehouse) throw new Error("No warehouse exists.");
    const rawLines = Array.isArray(args.lines) ? args.lines : [];
    const lines = [];
    for (const raw of rawLines) {
      const sku = String((raw as { sku?: string }).sku ?? "").trim();
      const quantity = Math.round(Number((raw as { quantity?: number }).quantity));
      const variant = await prisma.productVariant.findFirst({ where: { organizationId: actor.organizationId, sku } });
      if (!variant) throw new Error(`SKU ${sku} is not in the catalog.`);
      const unitCost = (raw as { unitCost?: number }).unitCost;
      lines.push({ variantId: variant.id, quantity, unitCostCents: unitCost == null ? undefined : Math.round(Number(unitCost) * 100) });
    }
    const order = await createPurchaseOrder(prisma, {
      organizationId: actor.organizationId,
      actorId: actor.actorId,
      supplierId: supplier.id,
      warehouseId: warehouse.id,
      notes: String(args.notes ?? "Created from a document in the assistant."),
      lines,
    });
    return { text: `Draft purchase order ${order.number} for ${supplier.name}, ${qty(lines.length)} lines. It is not ordered yet.`, links: [{ href: `/purchase-orders/${order.id}`, label: order.number, meta: supplier.name }] };
  }
  if (name === "set_order_priority" || name === "hold_order") {
    allow(actor, "sales.write");
    const number = String(args.number ?? "").trim();
    const order = await prisma.salesOrder.findFirst({ where: { organizationId: actor.organizationId, number } });
    if (!order) throw new Error(`Order ${number} was not found.`);
    if (name === "set_order_priority") {
      await setOrderPriority(prisma, { organizationId: actor.organizationId, actorId: actor.actorId, salesOrderId: order.id, priority: String(args.priority ?? "") });
      return { text: `${order.number} priority is now ${String(args.priority)}.`, links: [{ href: `/sales-orders/${order.id}`, label: order.number }] };
    }
    await setOrderHold(prisma, { organizationId: actor.organizationId, actorId: actor.actorId, salesOrderId: order.id, onHold: Boolean(args.hold) });
    return { text: Boolean(args.hold) ? `${order.number} is on hold.` : `${order.number} was released.`, links: [{ href: `/sales-orders/${order.id}`, label: order.number }] };
  }
  throw new Error(`Unknown tool ${name}.`);
}

type ChatMessage = { role: "system" | "user" | "assistant" | "tool"; content: string; toolCallId?: string; name?: string };

async function complete(provider: string, apiKey: string, messages: ChatMessage[], image?: { mime: string; base64: string }) {
  const controller = AbortSignal.timeout(35000);
  if (provider === "anthropic") {
    const system = messages.filter((message) => message.role === "system").map((message) => message.content).join("\n");
    const rest = messages.filter((message) => message.role !== "system").map((message) => {
      if (message.role === "tool") return { role: "user", content: [{ type: "tool_result", tool_use_id: message.toolCallId, content: message.content }] };
      if (message.role === "assistant" && message.toolCallId) {
        return { role: "assistant", content: [{ type: "tool_use", id: message.toolCallId, name: message.name, input: JSON.parse(message.content || "{}") }] };
      }
      return { role: message.role, content: message.content };
    });
    if (image && rest[0]?.role === "user" && typeof rest[0].content === "string") {
      rest[0] = { role: "user", content: [{ type: "image", source: { type: "base64", media_type: image.mime, data: image.base64 } }, { type: "text", text: rest[0].content }] } as never;
    }
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      signal: controller,
      headers: { "content-type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: "claude-sonnet-4-5",
        max_tokens: 1500,
        system,
        tools: tools.map((tool) => ({ name: tool.name, description: tool.description, input_schema: tool.parameters })),
        messages: rest,
      }),
    });
    const payload = await response.json() as { error?: { message?: string }; content?: { type: string; text?: string; id?: string; name?: string; input?: unknown }[] };
    if (!response.ok) throw new Error(payload.error?.message || "Claude refused the request.");
    const text = payload.content?.filter((block) => block.type === "text").map((block) => block.text).join("\n") ?? "";
    const calls = payload.content?.filter((block) => block.type === "tool_use").map((block) => ({ id: block.id || "", name: block.name || "", arguments: block.input })) ?? [];
    return { text, calls };
  }
  const url = provider === "xai" ? "https://api.x.ai/v1/chat/completions" : "https://api.openai.com/v1/chat/completions";
  const model = provider === "xai" ? "grok-3" : "gpt-4o-mini";
  const mapped = messages.map((message, index) => {
    if (message.role === "tool") return { role: "tool", tool_call_id: message.toolCallId, content: message.content };
    if (message.role === "assistant" && message.toolCallId) {
      return { role: "assistant", content: message.content || null, tool_calls: [{ id: message.toolCallId, type: "function", function: { name: message.name, arguments: message.content } }] };
    }
    if (index === messages.findIndex((item) => item.role === "user") && image && message.role === "user") {
      return { role: "user", content: [{ type: "text", text: message.content }, { type: "image_url", image_url: { url: `data:${image.mime};base64,${image.base64}` } }] };
    }
    return { role: message.role, content: message.content };
  });
  const response = await fetch(url, {
    method: "POST",
    signal: controller,
    headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      messages: mapped,
      tools: tools.map((tool) => ({ type: "function", function: { name: tool.name, description: tool.description, parameters: tool.parameters } })),
    }),
  });
  const payload = await response.json() as { error?: { message?: string }; choices?: { message?: { content?: string; tool_calls?: { id: string; function: { name: string; arguments: string } }[] } }[] };
  if (!response.ok) throw new Error(payload.error?.message || "The model refused the request.");
  const message = payload.choices?.[0]?.message;
  const calls = (message?.tool_calls ?? []).map((call) => {
    let parsed: unknown = {};
    try { parsed = JSON.parse(call.function.arguments || "{}"); } catch { parsed = {}; }
    return { id: call.id, name: call.function.name, arguments: parsed };
  });
  return { text: message?.content ?? "", calls };
}

export async function answerWithModel(actor: Actor, message: string, attachment?: { name: string; text?: string; image?: { mime: string; base64: string } }): Promise<AssistantAnswer | null> {
  const org = await prisma.organization.findUnique({ where: { id: actor.organizationId }, select: { aiProvider: true, aiKeyCipher: true, name: true } });
  if (!org?.aiProvider || !org.aiKeyCipher) return null;
  const apiKey = openSeal(org.aiKeyCipher);
  const fileNote = attachment?.text ? `\n\nAttached file ${attachment.name}:\n${attachment.text.slice(0, 30000)}` : attachment?.image ? `\n\nAn image named ${attachment.name} is attached.` : "";
  const messages: ChatMessage[] = [
    { role: "system", content: `You are the assistant inside Aera for the company “${org.name}”. You only know this company, through tools. Never invent numbers. You may change data a person could change by hand: names, notes, draft purchase orders, order priority and hold. You must never edit, delete or overwrite an issued invoice, a cancellation, a credit note, a posted journal entry, or stock movements. If someone asks to correct an invoice, tell them to create a credit note or a cancellation invoice. Answer in the user's language. Be concise. After a change, say exactly what changed.` },
    { role: "user", content: message + fileNote },
  ];
  const links: AssistantLink[] = [];
  let text = "";
  for (let step = 0; step < 6; step += 1) {
    const result = await complete(org.aiProvider, apiKey, messages, attachment?.image);
    text = result.text;
    const call = result.calls[0];
    if (!call) break;
    {
      messages.push({ role: "assistant", content: org.aiProvider === "anthropic" ? JSON.stringify(call.arguments ?? {}) : JSON.stringify(call.arguments ?? {}), toolCallId: call.id, name: call.name });
      try {
        const outcome = await runTool(actor, call.name, (call.arguments ?? {}) as Record<string, unknown>);
        links.push(...outcome.links);
        messages.push({ role: "tool", content: outcome.text.slice(0, 12000), toolCallId: call.id, name: call.name });
      } catch (error) {
        messages.push({ role: "tool", content: error instanceof Error ? error.message : "Tool failed.", toolCallId: call.id, name: call.name });
      }
    }
  }
  const unique = links.filter((link, index) => links.findIndex((item) => item.href === link.href) === index).slice(0, 8);
  return { title: "", body: text || "Done.", links: unique };
}
