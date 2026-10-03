import { parseDateInput, parseMoneyToCents } from "@/lib/format";

export function readLines(formData: FormData) {
  let data: unknown;
  try {
    data = JSON.parse(String(formData.get("lines") || "[]"));
  } catch {
    throw new Error("Could not read the lines.");
  }
  if (!Array.isArray(data) || data.length === 0) throw new Error("At least one line.");
  return data.map((line) => {
    const row = line as { variantId?: string; quantity?: number; amount?: string };
    return {
      variantId: String(row.variantId || ""),
      quantity: Number(row.quantity),
      unitAmount: row.amount ? parseMoneyToCents(String(row.amount)) : null,
    };
  });
}

export function readDate(formData: FormData, key: string) {
  const value = String(formData.get(key) || "");
  if (!value) return null;
  const date = parseDateInput(value);
  if (!date) throw new Error("Date is invalid.");
  return date;
}
