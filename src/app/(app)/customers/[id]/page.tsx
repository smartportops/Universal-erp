import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { one } from "@/lib/format";
import { translator } from "@/lib/i18n-server";
import { CustomerEditor } from "../customer-editor";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const tx = await translator();
  const { id } = await params;
  const customer = await prisma.customer.findUnique({ where: { id } });
  return { title: customer?.name ?? tx("Customer") };
}

export default async function CustomerPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const session = await requireUser();
  const { id } = await params;
  const query = await searchParams;
  const customer = await prisma.customer.findFirst({
    where: { id, organizationId: session.organization.id },
    include: {
      salesOrders: { orderBy: { orderedAt: "desc" }, take: 10, include: { lines: true } },
      invoices: { include: { payments: true }, orderBy: { issuedAt: "desc" } },
    },
  });
  if (!customer) notFound();
  return <CustomerEditor customer={customer} session={session} error={one(query.error)} notice={one(query.notice)} />;
}
