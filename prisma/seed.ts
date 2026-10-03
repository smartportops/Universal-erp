import { prisma } from "../src/lib/db";
import { daysFromToday } from "../src/lib/format";
import { hashPassword } from "../src/lib/password";
import {
  cancelSalesOrder,
  createPurchaseOrder,
  createReturn,
  createSalesOrder,
  issueInvoice,
  markDelivered,
  markPicking,
  markPurchaseOrdered,
  receivePurchaseOrder,
  receiveReturn,
  refundReturn,
  settlePayment,
  shipSalesOrder,
  transferStock,
} from "../src/server/domain/commerce";
import { record } from "../src/server/domain/platform";
import { chartAccounts } from "../src/server/domain/chart";

const passwordText = "aera-beta";

async function wipe() {
  const tables = await prisma.$queryRawUnsafe<{ tablename: string }[]>(
    "SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'",
  );
  if (!tables.length) return;
  const list = tables.map((table) => `"${table.tablename}"`).join(", ");
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`);
}

async function main() {
  await wipe();
  const passwordHash = await hashPassword(passwordText);
  const org = await prisma.organization.create({
    data: {
      name: "Heller Goods",
      legalName: "Heller Goods GmbH",
      slug: "heller",
      email: "ops@heller.demo",
      vatId: "DE329184756",
      street: "Linienstraße 42",
      postalCode: "10119",
      city: "Berlin",
    },
  });

  const people = [
    ["Mia Berg", "mia.berg@heller.demo", "owner"],
    ["Jonas Hart", "jonas.hart@heller.demo", "operations"],
    ["Leonie Vogel", "leonie.vogel@heller.demo", "warehouse"],
    ["Adam Weiss", "adam.weiss@heller.demo", "finance"],
    ["Gast Lesen", "guest.view@heller.demo", "viewer"],
  ] as const;
  const users: Record<string, string> = {};
  for (const [name, email, role] of people) {
    const user = await prisma.user.create({ data: { name, email, passwordHash } });
    await prisma.membership.create({ data: { organizationId: org.id, userId: user.id, role } });
    users[role] = user.id;
  }
  const mia = users.owner;
  const jonas = users.operations;
  const leonie = users.warehouse;
  const adam = users.finance;
  const actor = { organizationId: org.id };

  await prisma.taxRate.createMany({
    data: [
      { organizationId: org.id, name: "USt 19%", rateBps: 1900, isDefault: true },
      { organizationId: org.id, name: "USt 7%", rateBps: 700, isDefault: false },
    ],
  });
  await prisma.account.createMany({
    data: chartAccounts.map((account) => ({ organizationId: org.id, ...account })),
  });
  await prisma.numberSequence.createMany({
    data: [
      ["sales_order", "SO-", 10041, 5],
      ["purchase_order", "PO-", 2041, 4],
      ["shipment", "SH-", 30021, 5],
      ["invoice", "INV-", 50101, 5],
      ["invoice_cancellation", "ST-", 10001, 5],
      ["credit", "RK-", 10001, 5],
      ["credit_cancellation", "SK-", 10001, 5],
      ["quote", "QT-", 10001, 5],
      ["return", "RT-", 1101, 4],
      ["journal", "JE-", 90021, 5],
      ["voucher", "BE-", 1, 5],
    ].map(([key, prefix, nextNumber, padding]) => ({
      organizationId: org.id,
      key: String(key),
      prefix: String(prefix),
      nextNumber: Number(nextNumber),
      padding: Number(padding),
    })),
  });

  const ber = await prisma.warehouse.create({
    data: {
      organizationId: org.id,
      code: "BER",
      name: "Berlin Hauptlager",
      type: "own",
      street: "Gewerbehof 8",
      postalCode: "12459",
      city: "Berlin",
      isDefault: true,
      locations: {
        create: [
          { code: "A-01-01", name: "Kommissionierung", type: "pick" },
          { code: "B-02-01", name: "Nachschub", type: "bulk" },
          { code: "WE-01", name: "Wareneingang", type: "receiving" },
          { code: "RET-01", name: "Retouren", type: "returns" },
        ],
      },
    },
    include: { locations: true },
  });
  const ham = await prisma.warehouse.create({
    data: {
      organizationId: org.id,
      code: "HAM",
      name: "Hamburg 3PL",
      type: "3pl",
      city: "Hamburg",
      locations: {
        create: [
          { code: "HAM-01", name: "Kommissionierung", type: "pick" },
          { code: "HAM-02", name: "Nachschub", type: "bulk" },
        ],
      },
    },
    include: { locations: true },
  });

  const supplierDefs = [
    ["LF-001", "Leinenweberei Bode", "PT", 21, "hello@bode.example"],
    ["LF-002", "Wollspinnerei Alva", "DE", 14, "order@alva.example"],
    ["LF-003", "Keramik Holm", "DK", 28, "studio@holm.example"],
    ["LF-004", "Möbelwerk Sona", "PL", 35, "export@sona.example"],
    ["LF-005", "Näherei Kato", "PT", 18, "atelier@kato.example"],
  ] as const;
  const supplierIds: Record<string, string> = {};
  for (const [code, name, country, leadTimeDays, email] of supplierDefs) {
    const supplier = await prisma.supplier.create({
      data: { organizationId: org.id, code, name, country, leadTimeDays, email, paymentTerms: "30 Tage" },
    });
    supplierIds[name] = supplier.id;
  }

  const catalog = [
    ["Leinenbettwäsche Mora", "Schlafen", "Leinen", "Leinenweberei Bode", [
      ["LIN-BETT-GRY", "135x200 Grau", "4012345000011", 12900, 4800, 80, 120],
      ["LIN-BETT-SAN", "135x200 Sand", "4012345000012", 12900, 4800, 60, 80],
    ]],
    ["Leinen-Duvetbezug Lina", "Schlafen", "Leinen", "Leinenweberei Bode", [
      ["LIN-DUV-GRY", "135x200 Grau", "4012345000021", 8900, 3100, 100, 140],
    ]],
    ["Wolldecke Arve", "Wohnen", "Wolle", "Wollspinnerei Alva", [
      ["WOL-ARV-NAT", "Natur", "4012345000031", 14900, 6200, 50, 40],
    ]],
    ["Keramikbecher Holm", "Tisch", "Keramik", "Keramik Holm", [
      ["KER-HOL-WEI", "2er Set Weiß", "4012345000041", 3600, 1100, 200, 240],
    ]],
    ["Eichenregal Sona", "Möbel", "Eiche", "Möbelwerk Sona", [
      ["MOI-SON-80", "80 cm", "4012345000051", 24900, 9800, 30, 20],
    ]],
    ["Baumwollhemd Kato", "Bekleidung", "Baumwolle", "Näherei Kato", [
      ["HEM-KAT-S", "S", "4012345000061", 7900, 2400, 40, 40],
      ["HEM-KAT-M", "M", "4012345000062", 7900, 2400, 60, 60],
      ["HEM-KAT-L", "L", "4012345000063", 7900, 2400, 40, 40],
    ]],
    ["Merinopullover Nils", "Bekleidung", "Merino", "Näherei Kato", [
      ["PUL-NIL-M", "M", "4012345000071", 12800, 4600, 40, 30],
      ["PUL-NIL-L", "L", "4012345000072", 12800, 4600, 40, 30],
    ]],
    ["Leinentasche Fold", "Accessoires", "Leinen", "Leinenweberei Bode", [
      ["TAS-FOL-NAT", "Natur", "4012345000081", 4200, 1400, 150, 100],
    ]],
  ] as const;

  for (const [name, category, material, supplierName, variants] of catalog) {
    const product = await prisma.product.create({
      data: { organizationId: org.id, name, category, description: material },
    });
    for (const [sku, variantName, ean, price, cost, reorder, suggest] of variants) {
      await prisma.productVariant.create({
        data: {
          organizationId: org.id,
          productId: product.id,
          sku,
          name: variantName,
          ean,
          priceCents: price,
          costCents: cost,
          reorderPoint: reorder,
          reorderQty: suggest,
          preferredSupplierId: supplierIds[supplierName],
        },
      });
    }
  }

  const customers = [
    ["KD-1001", "Emma Krüger", "b2c", "Berlin", "emma@example.com", "Sofort"],
    ["KD-1002", "Jonas Albrecht", "b2c", "Hamburg", "jonas.a@example.com", "Sofort"],
    ["KD-1003", "Nina Paul", "b2c", "Köln", "nina@example.com", "Sofort"],
    ["KD-1004", "Lena Vogt", "b2c", "München", "lena@example.com", "Sofort"],
    ["KD-1005", "Paul Richter", "b2c", "Leipzig", "paul@example.com", "Sofort"],
    ["KD-1006", "Mara Engel", "b2c", "Dresden", "mara@example.com", "Sofort"],
    ["KD-1007", "Ida Blum", "b2c", "Frankfurt", "ida@example.com", "Sofort"],
    ["KD-1008", "Finn Oster", "b2c", "Hannover", "finn@example.com", "Sofort"],
    ["KD-2001", "Studio Nord GmbH", "b2b", "Hamburg", "einkauf@studionord.example", "30 Tage"],
    ["KD-2002", "Atelier Lind GmbH", "b2b", "Berlin", "buying@lind.example", "30 Tage"],
    ["KD-2003", "Casa Mercado GmbH", "b2b", "Düsseldorf", "orders@mercado.example", "30 Tage"],
    ["KD-2004", "Haus Form AG", "b2b", "Köln", "procurement@hausform.example", "14 Tage"],
  ] as const;
  const customerIds: Record<string, string> = {};
  for (const [code, name, type, city, email, paymentTerms] of customers) {
    const customer = await prisma.customer.create({
      data: { organizationId: org.id, code, name, type, city, email, paymentTerms },
    });
    customerIds[name] = customer.id;
  }

  const variants = await prisma.productVariant.findMany({ where: { organizationId: org.id } });
  const skuOf = Object.fromEntries(variants.map((variant) => [variant.sku, variant.id]));
  const line = (sku: string, qty: number) => ({ variantId: skuOf[sku], quantity: qty });

  await prisma.webhookEndpoint.create({
    data: {
      organizationId: org.id,
      url: "https://example.com/hooks/aera",
      events: JSON.stringify(["sales_order.shipped", "stock.negative"]),
      secret: "beta-secret",
    },
  });
  await prisma.integration.createMany({
    data: ["Shopify", "Amazon", "eBay", "Mollie", "GLS", "DHL", "DATEV"].map((provider) => ({
      organizationId: org.id,
      provider,
      status: "disconnected",
      note: "Für die Beta vorbereitet. Noch keine Verbindung.",
    })),
  });

  const purchases = [
    { supplier: "Leinenweberei Bode", at: -40, expected: -30, stage: "received" as const, lines: [line("LIN-BETT-GRY", 200), line("LIN-BETT-SAN", 120), line("LIN-DUV-GRY", 100)] },
    { supplier: "Wollspinnerei Alva", at: -36, expected: -28, stage: "received" as const, lines: [line("WOL-ARV-NAT", 80)] },
    { supplier: "Keramik Holm", at: -34, expected: -26, stage: "received" as const, lines: [line("KER-HOL-WEI", 300)] },
    { supplier: "Möbelwerk Sona", at: -33, expected: -20, stage: "received" as const, lines: [line("MOI-SON-80", 40)] },
    { supplier: "Näherei Kato", at: -32, expected: -24, stage: "received" as const, lines: [line("HEM-KAT-S", 120), line("HEM-KAT-M", 100), line("HEM-KAT-L", 80), line("PUL-NIL-M", 80), line("PUL-NIL-L", 60), line("TAS-FOL-NAT", 300)] },
    { supplier: "Keramik Holm", at: -2, expected: 12, stage: "ordered" as const, lines: [line("KER-HOL-WEI", 240)] },
    { supplier: "Näherei Kato", at: -20, expected: -4, stage: "ordered" as const, notes: "Näherei hat den Stoff später bekommen.", lines: [line("PUL-NIL-L", 60)] },
    { supplier: "Leinenweberei Bode", at: -1, expected: 14, stage: "draft" as const, lines: [line("LIN-DUV-GRY", 200)] },
  ];
  for (const purchase of purchases) {
    const order = await createPurchaseOrder(prisma, {
      ...actor,
      actorId: mia,
      supplierId: supplierIds[purchase.supplier],
      warehouseId: ber.id,
      expectedAt: daysFromToday(purchase.expected),
      notes: purchase.notes ?? "",
      lines: purchase.lines,
      at: daysFromToday(purchase.at),
    });
    if (purchase.stage === "draft") continue;
    await markPurchaseOrdered(prisma, { ...actor, actorId: mia, purchaseOrderId: order.id, at: daysFromToday(purchase.at) });
    if (purchase.stage === "received") {
      await receivePurchaseOrder(prisma, { ...actor, actorId: leonie, purchaseOrderId: order.id, at: daysFromToday(purchase.expected) });
    }
  }

  await transferStock(prisma, {
    ...actor,
    actorId: leonie,
    variantId: skuOf["KER-HOL-WEI"],
    fromLocationId: ber.locations.find((location) => location.code === "A-01-01")!.id,
    toLocationId: ham.locations.find((location) => location.code === "HAM-01")!.id,
    quantity: 60,
    at: daysFromToday(-22),
  });

  type OrderSpec = {
    key: string;
    customer: string;
    channel: string;
    at: number;
    promised: number;
    lines: { variantId: string; quantity: number }[];
    externalRef?: string;
    ship?: { at: number; carrier: string; tracking: string; quantities?: Record<string, number> };
    deliver?: number;
    picking?: boolean;
    cancel?: boolean;
    invoice?: { at: number; due: number; pay?: true | "half" };
  };

  const orders: OrderSpec[] = [
    { key: "emma", customer: "Emma Krüger", channel: "shop", at: -12, promised: -10, externalRef: "SHOP-18442", lines: [line("LIN-BETT-GRY", 20), line("TAS-FOL-NAT", 10)], ship: { at: -11, carrier: "DHL", tracking: "00340434161094000018" }, deliver: -9, invoice: { at: -11, due: -11, pay: true } },
    { key: "jonas", customer: "Jonas Albrecht", channel: "shop", at: -9, promised: -7, externalRef: "SHOP-18490", lines: [line("KER-HOL-WEI", 40), line("HEM-KAT-M", 10), line("TAS-FOL-NAT", 10)], ship: { at: -8, carrier: "DHL", tracking: "00340434161094000025" }, deliver: -6, invoice: { at: -8, due: -8, pay: true } },
    { key: "lind", customer: "Atelier Lind GmbH", channel: "wholesale", at: -6, promised: -2, lines: [line("LIN-BETT-SAN", 40), line("WOL-ARV-NAT", 20)], ship: { at: -1, carrier: "GLS", tracking: "1234567890123" }, invoice: { at: -1, due: 20 } },
    { key: "nina", customer: "Nina Paul", channel: "amazon", at: -3, promised: -1, externalRef: "AMZ-304-8891201", lines: [line("HEM-KAT-L", 10), line("TAS-FOL-NAT", 20)] },
    { key: "casa", customer: "Casa Mercado GmbH", channel: "wholesale", at: -4, promised: 3, lines: [line("KER-HOL-WEI", 100), line("LIN-BETT-GRY", 20)], ship: { at: -2, carrier: "DHL", tracking: "00340434161094000032", quantities: { [skuOf["KER-HOL-WEI"]]: 60, [skuOf["LIN-BETT-GRY"]]: 20 } } },
    { key: "lena", customer: "Lena Vogt", channel: "shop", at: -8, promised: -6, externalRef: "SHOP-18502", lines: [line("HEM-KAT-S", 10)], ship: { at: -7, carrier: "DHL", tracking: "00340434161094000049" }, deliver: -5, invoice: { at: -7, due: -7, pay: true } },
    { key: "paul", customer: "Paul Richter", channel: "shop", at: -5, promised: -3, externalRef: "SHOP-18520", lines: [line("PUL-NIL-M", 10)], ship: { at: -4, carrier: "DHL", tracking: "00340434161094000056" }, deliver: -2, invoice: { at: -4, due: -4, pay: true } },
    { key: "studio", customer: "Studio Nord GmbH", channel: "wholesale", at: -8, promised: -5, lines: [line("LIN-DUV-GRY", 60), line("MOI-SON-80", 10)], picking: true },
    { key: "haus", customer: "Haus Form AG", channel: "wholesale", at: -7, promised: -6, lines: [line("LIN-DUV-GRY", 80), line("MOI-SON-80", 10)], ship: { at: -5, carrier: "GLS", tracking: "1234567890456" }, deliver: -3, invoice: { at: -5, due: -1 } },
    { key: "mara", customer: "Mara Engel", channel: "shop", at: -1, promised: 0, externalRef: "SHOP-18601", lines: [line("LIN-DUV-GRY", 60)], ship: { at: 0, carrier: "DHL", tracking: "00340434161094000063" }, invoice: { at: 0, due: 7 } },
    { key: "cancel", customer: "Lena Vogt", channel: "shop", at: -2, promised: 4, lines: [line("TAS-FOL-NAT", 10)], cancel: true },
    { key: "future", customer: "Jonas Albrecht", channel: "shop", at: -1, promised: 5, externalRef: "SHOP-18610", lines: [line("HEM-KAT-S", 20)] },
    { key: "finn", customer: "Finn Oster", channel: "amazon", at: -7, promised: -5, externalRef: "AMZ-304-8891444", lines: [line("KER-HOL-WEI", 80), line("TAS-FOL-NAT", 20)], ship: { at: -6, carrier: "DHL", tracking: "00340434161094000070" }, deliver: -4, invoice: { at: -6, due: -6, pay: true } },
    { key: "ida", customer: "Ida Blum", channel: "shop", at: -2, promised: -1, externalRef: "SHOP-18580", lines: [line("HEM-KAT-S", 30), line("TAS-FOL-NAT", 20)], ship: { at: -1, carrier: "DHL", tracking: "00340434161094000087" }, deliver: -1, invoice: { at: -1, due: -1, pay: true } },
    { key: "studio2", customer: "Studio Nord GmbH", channel: "wholesale", at: -6, promised: -4, lines: [line("HEM-KAT-M", 70)], ship: { at: -3, carrier: "GLS", tracking: "1234567890789" }, deliver: -2, invoice: { at: -3, due: 10, pay: "half" } },
    { key: "paul2", customer: "Paul Richter", channel: "shop", at: -3, promised: -2, externalRef: "SHOP-18555", lines: [line("PUL-NIL-M", 20)], ship: { at: -2, carrier: "DHL", tracking: "00340434161094000094" }, deliver: -1, invoice: { at: -2, due: -2 } },
    { key: "haus2", customer: "Haus Form AG", channel: "wholesale", at: -9, promised: -7, lines: [line("PUL-NIL-L", 50)], ship: { at: -8, carrier: "DHL", tracking: "00340434161094000100" }, deliver: -6, invoice: { at: -8, due: -8, pay: true } },
  ];

  const created: Record<string, string> = {};
  for (const spec of orders) {
    const order = await createSalesOrder(prisma, {
      ...actor,
      actorId: mia,
      customerId: customerIds[spec.customer],
      warehouseId: ber.id,
      channel: spec.channel,
      promisedAt: daysFromToday(spec.promised),
      externalRef: spec.externalRef,
      lines: spec.lines,
      at: daysFromToday(spec.at),
    });
    created[spec.key] = order.id;
    if (spec.cancel) {
      await cancelSalesOrder(prisma, { ...actor, actorId: mia, salesOrderId: order.id, at: daysFromToday(spec.at) });
      continue;
    }
    if (spec.picking) {
      await markPicking(prisma, { ...actor, actorId: leonie, salesOrderId: order.id, at: daysFromToday(spec.at) });
    }
    if (spec.ship) {
      await shipSalesOrder(prisma, {
        ...actor,
        actorId: leonie,
        salesOrderId: order.id,
        carrier: spec.ship.carrier,
        trackingNumber: spec.ship.tracking,
        quantitiesByVariant: spec.ship.quantities,
        at: daysFromToday(spec.ship.at),
      });
    }
    if (spec.deliver != null) {
      await markDelivered(prisma, { ...actor, actorId: leonie, salesOrderId: order.id, at: daysFromToday(spec.deliver) });
    }
    if (spec.invoice) {
      const invoice = await issueInvoice(prisma, {
        ...actor,
        actorId: adam,
        salesOrderId: order.id,
        dueAt: daysFromToday(spec.invoice.due),
        at: daysFromToday(spec.invoice.at),
      });
      if (spec.invoice.pay) {
        const fresh = await prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } });
        const amount = spec.invoice.pay === "half" ? Math.round(fresh.totalCents / 2) : fresh.totalCents;
        await settlePayment(prisma, {
          ...actor,
          actorId: adam,
          invoiceId: invoice.id,
          amountCents: amount,
          method: "bank",
          reference: "SEED",
          at: daysFromToday(spec.invoice.at),
        });
      }
    }
  }

  const lenaReturn = await createReturn(prisma, {
    ...actor,
    actorId: jonas,
    salesOrderId: created.lena,
    reason: "Größe passt nicht",
    lines: [{ variantId: skuOf["HEM-KAT-S"], quantity: 10, disposition: "restock" }],
    at: daysFromToday(-4),
  });
  await receiveReturn(prisma, { ...actor, actorId: leonie, returnId: lenaReturn.id, at: daysFromToday(-3) });
  await refundReturn(prisma, { ...actor, actorId: adam, returnId: lenaReturn.id, at: daysFromToday(-3) });
  await createReturn(prisma, {
    ...actor,
    actorId: jonas,
    salesOrderId: created.paul,
    reason: "Farbe weicht ab",
    lines: [{ variantId: skuOf["PUL-NIL-M"], quantity: 10, disposition: "restock" }],
    at: daysFromToday(-1),
  });

  await prisma.$transaction(async (tx) => {
    await record(tx, {
      organizationId: org.id,
      actorId: jonas,
      type: "comment.created",
      entityType: "sales_order",
      entityId: created.studio,
      summary: "Notiz",
      body: "Kunde hat nachgefasst. Die Lieferung steht noch.",
      kind: "comment",
      at: daysFromToday(-1),
    });
  });

  const material = await prisma.customFieldDefinition.create({
    data: { organizationId: org.id, entityType: "product", key: "material", label: "Material", fieldType: "text" },
  });
  const shopify = await prisma.customFieldDefinition.create({
    data: { organizationId: org.id, entityType: "customer", key: "shopify_id", label: "Shopify-Kundennummer", fieldType: "text" },
  });
  const products = await prisma.product.findMany({ where: { organizationId: org.id } });
  for (const product of products) {
    const match = catalog.find((item) => item[0] === product.name);
    if (!match) continue;
    await prisma.customFieldValue.create({
      data: { organizationId: org.id, definitionId: material.id, entityId: product.id, value: match[2] },
    });
  }
  await prisma.customFieldValue.create({
    data: { organizationId: org.id, definitionId: shopify.id, entityId: customerIds["Emma Krüger"], value: "gid://shopify/Customer/1001" },
  });

  const shelf = skuOf["MOI-SON-80"];
  await prisma.serialNumber.createMany({
    data: [
      { organizationId: org.id, variantId: shelf, warehouseId: ber.id, value: "SN-SON-1008", status: "shipped" },
      { organizationId: org.id, variantId: shelf, warehouseId: ber.id, value: "SN-SON-1009", status: "in_stock" },
      { organizationId: org.id, variantId: shelf, warehouseId: ber.id, value: "SN-SON-1010", status: "in_stock" },
      { organizationId: org.id, variantId: shelf, warehouseId: ber.id, value: "SN-SON-1011", status: "in_stock" },
    ],
  });
  await prisma.savedView.create({
    data: { organizationId: org.id, entityType: "sales_order", name: "Großhandel", query: "channel=wholesale", shared: true },
  });

  const movements = await prisma.stockMovement.groupBy({
    by: ["variantId"],
    where: { organizationId: org.id },
    _sum: { quantity: true },
  });
  const duvet = movements.find((row) => row.variantId === skuOf["LIN-DUV-GRY"])?._sum.quantity;
  const shirt = movements.find((row) => row.variantId === skuOf["HEM-KAT-M"])?._sum.quantity;
  const journals = await prisma.journalLine.aggregate({ _sum: { debitCents: true, creditCents: true } });
  if (duvet !== -40) throw new Error(`Duvet-Bestand erwartet -40, ist ${duvet}`);
  if (shirt !== 20) throw new Error(`Hemd M erwartet 20, ist ${shirt}`);
  if (journals._sum.debitCents !== journals._sum.creditCents) {
    throw new Error(`Journal unausgeglichen ${journals._sum.debitCents} / ${journals._sum.creditCents}`);
  }
  console.log(`Aera seed ok. Duvet ${duvet}, Hemd M ${shirt}, Journal ${journals._sum.debitCents}`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
