import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { translator } from "@/lib/i18n-server";
import { SupplierEditor } from "../supplier-editor";

export async function generateMetadata() {
  const tx = await translator();
  return { title: tx("New supplier") };
}

export default async function NewSupplierPage() {
  const session = await requireUser();
  if (!can(session.role, "purchasing.write")) redirect("/suppliers");
  return <SupplierEditor supplier={null} session={session} />;
}
