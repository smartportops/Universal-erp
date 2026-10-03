import { prisma } from "@/lib/db";
import { splitGross } from "@/lib/format";

const OUTPUT_VAT = "3800";
const INPUT_VAT = "1570";

function signOf(kind: string) {
  return kind === "cancellation" || kind === "credit" ? -1 : 1;
}

export type VatRow = { rateBps: number; outNet: number; outTax: number; inNet: number; inTax: number };

export type VatReport = {
  rows: VatRow[];
  outNet: number;
  outTax: number;
  inNet: number;
  inTax: number;
  payable: number;
  bookedOutput: number;
  bookedInput: number;
};

export async function vatReturn(organizationId: string, from: Date, to: Date): Promise<VatReport> {
  const [invoices, vouchers, taxLines] = await Promise.all([
    prisma.invoice.findMany({
      where: { organizationId, status: { not: "void" }, issuedAt: { gte: from, lt: to } },
      include: { lines: true },
    }),
    prisma.voucher.findMany({
      where: { organizationId, status: "booked", issuedAt: { gte: from, lt: to } },
    }),
    prisma.journalLine.findMany({
      where: {
        account: { organizationId, code: { in: [OUTPUT_VAT, INPUT_VAT] } },
        entry: { entryDate: { gte: from, lt: to } },
      },
      include: { account: { select: { code: true } } },
    }),
  ]);
  const buckets = new Map<number, VatRow>();
  const bucket = (rate: number) => {
    const row = buckets.get(rate) ?? { rateBps: rate, outNet: 0, outTax: 0, inNet: 0, inTax: 0 };
    buckets.set(rate, row);
    return row;
  };
  for (const invoice of invoices) {
    const sign = signOf(invoice.kind);
    for (const line of invoice.lines) {
      const gross = sign * line.quantity * line.unitPriceCents;
      const parts = splitGross(Math.abs(gross), line.taxRateBps);
      const way = gross < 0 ? -1 : 1;
      const row = bucket(line.taxRateBps);
      row.outNet += way * parts.net;
      row.outTax += way * parts.tax;
    }
  }
  for (const voucher of vouchers) {
    const row = bucket(voucher.taxRateBps);
    if (voucher.direction === "in") {
      row.inNet += voucher.netCents;
      row.inTax += voucher.taxCents;
    } else {
      row.outNet += voucher.netCents;
      row.outTax += voucher.taxCents;
    }
  }
  const rows = [...buckets.values()].filter((row) => row.outNet || row.outTax || row.inNet || row.inTax).sort((a, b) => b.rateBps - a.rateBps);
  const outNet = rows.reduce((sum, row) => sum + row.outNet, 0);
  const outTax = rows.reduce((sum, row) => sum + row.outTax, 0);
  const inNet = rows.reduce((sum, row) => sum + row.inNet, 0);
  const inTax = rows.reduce((sum, row) => sum + row.inTax, 0);
  let bookedOutput = 0;
  let bookedInput = 0;
  for (const line of taxLines) {
    if (line.account.code === OUTPUT_VAT) bookedOutput += line.creditCents - line.debitCents;
    else bookedInput += line.debitCents - line.creditCents;
  }
  return { rows, outNet, outTax, inNet, inTax, payable: outTax - inTax, bookedOutput, bookedInput };
}

export type StatementLine = { code: string; name: string; amount: number };

export type Statements = {
  revenue: StatementLine[];
  expenses: StatementLine[];
  revenueTotal: number;
  expenseTotal: number;
  result: number;
  assets: StatementLine[];
  liabilities: StatementLine[];
  equity: StatementLine[];
  priorResult: number;
  assetTotal: number;
  liabilityTotal: number;
  equityTotal: number;
  balanced: boolean;
};

type Bucket = { code: string; name: string; type: string; before: number; during: number };

export async function annualStatements(organizationId: string, year: number): Promise<Statements> {
  const start = new Date(Date.UTC(year, 0, 1));
  const end = new Date(Date.UTC(year + 1, 0, 1));
  const lines = await prisma.journalLine.findMany({
    where: { entry: { organizationId, entryDate: { lt: end } } },
    include: { account: true, entry: { select: { entryDate: true } } },
  });
  const accounts = new Map<string, Bucket>();
  for (const line of lines) {
    const bucket = accounts.get(line.accountId) ?? { code: line.account.code, name: line.account.name, type: line.account.type, before: 0, during: 0 };
    const raw = line.debitCents - line.creditCents;
    if (line.entry.entryDate < start) bucket.before += raw;
    else bucket.during += raw;
    accounts.set(line.accountId, bucket);
  }
  const list = [...accounts.values()].sort((a, b) => a.code.localeCompare(b.code));
  const natural = (bucket: Bucket, raw: number) => (bucket.type === "asset" || bucket.type === "expense" ? raw : -raw);
  const pick = (type: string, which: "before" | "during" | "total") =>
    list
      .filter((bucket) => bucket.type === type)
      .map((bucket) => ({
        code: bucket.code,
        name: bucket.name,
        amount: natural(bucket, which === "before" ? bucket.before : which === "during" ? bucket.during : bucket.before + bucket.during),
      }))
      .filter((line) => line.amount !== 0);
  const revenue = pick("revenue", "during");
  const expenses = pick("expense", "during");
  const revenueTotal = revenue.reduce((sum, line) => sum + line.amount, 0);
  const expenseTotal = expenses.reduce((sum, line) => sum + line.amount, 0);
  const result = revenueTotal - expenseTotal;
  const priorRevenue = pick("revenue", "before").reduce((sum, line) => sum + line.amount, 0);
  const priorExpense = pick("expense", "before").reduce((sum, line) => sum + line.amount, 0);
  const priorResult = priorRevenue - priorExpense;
  const assets = pick("asset", "total");
  const liabilities = pick("liability", "total");
  const equity = pick("equity", "total");
  const assetTotal = assets.reduce((sum, line) => sum + line.amount, 0);
  const liabilityTotal = liabilities.reduce((sum, line) => sum + line.amount, 0);
  const equityTotal = equity.reduce((sum, line) => sum + line.amount, 0) + priorResult + result;
  return {
    revenue,
    expenses,
    revenueTotal,
    expenseTotal,
    result,
    assets,
    liabilities,
    equity,
    priorResult,
    assetTotal,
    liabilityTotal,
    equityTotal,
    balanced: assetTotal === liabilityTotal + equityTotal,
  };
}
