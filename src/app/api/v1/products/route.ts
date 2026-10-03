import { createHash } from "crypto";
import { prisma } from "@/lib/db";

export async function GET(request: Request) {
  const header = request.headers.get("authorization") ?? "";
  const token = header.replace(/^Bearer\s+/i, "");
  if (!token.startsWith("aera_")) return Response.json({ error: "unauthorized" }, { status: 401 });
  const hash = createHash("sha256").update(token).digest("hex");
  const key = await prisma.apiKey.findUnique({ where: { hash } });
  if (!key) return Response.json({ error: "unauthorized" }, { status: 401 });
  await prisma.apiKey.update({ where: { id: key.id }, data: { lastUsedAt: new Date() } });
  const products = await prisma.product.findMany({
    where: { organizationId: key.organizationId, status: { not: "archived" } },
    include: { variants: true },
    orderBy: { name: "asc" },
  });
  return Response.json({
    products: products.map((product) => ({
      id: product.id,
      name: product.name,
      status: product.status,
      variants: product.variants.map((variant) => ({
        id: variant.id,
        sku: variant.sku,
        ean: variant.ean,
        price_cents: variant.priceCents,
        cost_cents: variant.costCents,
      })),
    })),
  });
}
