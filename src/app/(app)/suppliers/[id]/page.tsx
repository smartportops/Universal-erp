import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { one } from "@/lib/format";
import { translator } from "@/lib/i18n-server";
import { SupplierEditor } from "../supplier-editor";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const tx = await translator();
  const { id } = await params;
  const supplier = await prisma.supplier.findUnique({ where: { id } });
  return { title: supplier?.name ?? tx("Supplier") };
}

export default async function SupplierPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const session = await requireUser();
  const { id } = await params;
  const query = await searchParams;
  const supplier = await prisma.supplier.findFirst({
    where: { id, organizationId: session.organization.id },
    include: {
      contacts: { orderBy: { position: "asc" } },
      bankAccounts: { orderBy: { position: "asc" } },
      purchaseOrders: { orderBy: { createdAt: "desc" }, take: 10, include: { lines: true } },
    },
  });
  if (!supplier) notFound();
  return <SupplierEditor supplier={supplier} session={session} error={one(query.error)} notice={one(query.notice)} />;
}
