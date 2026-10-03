import type { Tx } from "@/lib/db";
import { chartAccounts } from "@/server/domain/chart";

// Every registration gets its own Organization. All commerce data hangs off
// organizationId, so this is the tenant boundary inside the shared database.

export type ProvisionInput = {
  companyName: string;
  ownerName: string;
  email: string;
  passwordHash: string;
  country?: string;
};

export function slugify(value: string) {
  const base = value
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return base || "company";
}

async function freeSlug(tx: Tx, wanted: string) {
  const taken = await tx.organization.findMany({
    where: { OR: [{ slug: wanted }, { slug: { startsWith: `${wanted}-` } }] },
    select: { slug: true },
  });
  if (!taken.length) return wanted;
  const used = new Set(taken.map((row) => row.slug));
  for (let n = 2; n < 10_000; n += 1) {
    const candidate = `${wanted}-${n}`;
    if (!used.has(candidate)) return candidate;
  }
  return `${wanted}-${Date.now().toString(36)}`;
}

export async function provisionOrganization(tx: Tx, input: ProvisionInput) {
  const country = input.country ?? "DE";
  const organization = await tx.organization.create({
    data: {
      name: input.companyName,
      legalName: input.companyName,
      slug: await freeSlug(tx, slugify(input.companyName)),
      email: input.email,
      country,
    },
  });
  const user = await tx.user.create({
    data: { name: input.ownerName, email: input.email, passwordHash: input.passwordHash },
  });
  const membership = await tx.membership.create({
    data: { organizationId: organization.id, userId: user.id, role: "owner" },
  });

  await tx.taxRate.createMany({
    data: [
      { organizationId: organization.id, name: "USt 19%", rateBps: 1900, country, isDefault: true },
      { organizationId: organization.id, name: "USt 7%", rateBps: 700, country, isDefault: false },
      { organizationId: organization.id, name: "USt 0%", rateBps: 0, country, isDefault: false },
    ],
  });
  await tx.account.createMany({
    data: chartAccounts.map((account) => ({ organizationId: organization.id, ...account })),
  });
  await tx.numberSequence.createMany({
    data: [
      ["sales_order", "SO-", 5],
      ["purchase_order", "PO-", 4],
      ["shipment", "SH-", 5],
      ["invoice", "INV-", 5],
      ["invoice_cancellation", "ST-", 5],
      ["credit", "RK-", 5],
      ["credit_cancellation", "SK-", 5],
      ["quote", "QT-", 5],
      ["return", "RT-", 4],
      ["journal", "JE-", 5],
      ["voucher", "BE-", 5],
    ].map(([key, prefix, padding]) => ({
      organizationId: organization.id,
      key: String(key),
      prefix: String(prefix),
      nextNumber: 1,
      padding: Number(padding),
    })),
  });
  await tx.warehouse.create({
    data: {
      organizationId: organization.id,
      code: "MAIN",
      name: "Hauptlager",
      type: "own",
      country,
      isDefault: true,
      locations: {
        create: [
          { code: "A-01", name: "Kommissionierung", type: "pick" },
          { code: "WE-01", name: "Wareneingang", type: "receiving" },
          { code: "RET-01", name: "Retouren", type: "returns" },
        ],
      },
    },
  });

  return { organization, user, membership };
}
