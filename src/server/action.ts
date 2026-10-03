import { redirect, unstable_rethrow } from "next/navigation";
import { revalidatePath } from "next/cache";

export function messageFor(error: unknown) {
  const code = (error as { code?: string } | null)?.code;
  if (code === "P2002") {
    const target = String((error as { meta?: { target?: unknown } }).meta?.target ?? "");
    if (target.includes("sku")) return "This SKU already exists.";
    return "This value is already taken.";
  }
  if (typeof code === "string" && code.startsWith("P")) return "Could not save.";
  return error instanceof Error ? error.message : "Could not save.";
}

export async function runAction(fallbackPath: string, fn: () => Promise<void>) {
  try {
    await fn();
  } catch (error) {
    unstable_rethrow(error);
    const join = fallbackPath.includes("?") ? "&" : "?";
    redirect(`${fallbackPath}${join}error=${encodeURIComponent(messageFor(error))}`);
  }
}

export function refresh() {
  revalidatePath("/", "layout");
}

export async function nextCode(prefix: string, codes: string[], pad: number) {
  const max = codes.reduce((top, code) => {
    const value = Number(code.slice(prefix.length));
    return Number.isFinite(value) && value > top ? value : top;
  }, 0);
  return `${prefix}${String(max + 1).padStart(pad, "0")}`;
}
