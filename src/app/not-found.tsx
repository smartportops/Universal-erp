import Link from "next/link";
import { translator } from "@/lib/i18n-server";

export default async function NotFound() {
  const tx = await translator();
  return (
    <main className="grid min-h-screen place-items-center px-6">
      <div className="max-w-sm text-center">
        <p className="text-sm text-muted">404</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">{tx("This page does not exist.")}</h1>
        <Link href="/" className="mt-4 inline-block text-sm text-accent">
          {tx("Back to overview")}
        </Link>
      </div>
    </main>
  );
}
