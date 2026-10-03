"use client";

import { useRouter } from "next/navigation";
import type { MouseEvent, ReactNode } from "react";

/** Table row that navigates on click, but leaves links, buttons and inputs inside it alone. */
export function ClickRow({ href, className, children }: { href?: string; className?: string; children: ReactNode }) {
  const router = useRouter();

  function onClick(event: MouseEvent<HTMLTableRowElement>) {
    if (!href) return;
    if (event.defaultPrevented || event.button !== 0) return;
    const target = event.target as HTMLElement;
    if (target.closest("a, button, input, select, textarea, label, [contenteditable]")) return;
    if (event.metaKey || event.ctrlKey) {
      window.open(href, "_blank", "noopener");
      return;
    }
    router.push(href);
  }

  return (
    <tr className={className} onClick={href ? onClick : undefined} style={href ? { cursor: "pointer" } : undefined}>
      {children}
    </tr>
  );
}
