import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { translator } from "@/lib/i18n-server";
import { CustomerEditor } from "../customer-editor";

export async function generateMetadata() {
  const tx = await translator();
  return { title: tx("New customer") };
}

export default async function NewCustomerPage() {
  const session = await requireUser();
  if (!can(session.role, "sales.write")) redirect("/customers");
  return <CustomerEditor customer={null} session={session} />;
}
