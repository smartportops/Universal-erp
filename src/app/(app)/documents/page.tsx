import { redirect } from "next/navigation";
import { translator } from "@/lib/i18n-server";

export async function generateMetadata() {
  const tx = await translator();
  return { title: tx("Documents") };
}

export default function DocumentsPage() {
  redirect("/settings?section=documents");
}
