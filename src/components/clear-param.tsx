"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect } from "react";

/** Drops a one-shot query parameter (e.g. ?new=1) from the address bar once the page has mounted. */
export function ClearParam({ name }: { name: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  useEffect(() => {
    if (!params.has(name)) return;
    const rest = new URLSearchParams(params.toString());
    rest.delete(name);
    const query = rest.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }, [name, params, pathname, router]);

  return null;
}
