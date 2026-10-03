import { redirect } from "next/navigation";
import { one } from "@/lib/format";
import { translator } from "@/lib/i18n-server";

export async function generateMetadata() {
  const tx = await translator();
  return { title: tx("Activities") };
}

export default async function ActivitiesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const query = await searchParams;
  const tab = one(query.tab);
  redirect(tab === "audit" ? "/settings?section=activities&tab=audit" : "/settings?section=activities");
}
