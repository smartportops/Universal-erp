import type { ReactElement } from "react";
import { NavLink, useParams } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import { internalItems } from "@/app/nav";
import { Page } from "@/app/shell";
import { cn } from "@/lib/format";
import { useT } from "@/lib/i18n";
import { EmptyState } from "@/ui";
import { AdjustTool } from "./tools/adjust";
import { ArticlesTool } from "./tools/articles";
import { BinsTool } from "./tools/bins";
import { ConditionTool } from "./tools/condition";
import { CountTool } from "./tools/count";
import { TransferTool } from "./tools/transfer";

/** Register new internal tools here and in `app/nav.ts`. */
const tools: Record<string, () => ReactElement> = {
  transfer: TransferTool,
  count: CountTool,
  adjust: AdjustTool,
  condition: ConditionTool,
  bins: BinsTool,
  articles: ArticlesTool,
};

export function InternalPage() {
  const t = useT();
  const { tool = "transfer" } = useParams();
  const Tool = tools[tool];
  const current = internalItems.find((item) => item.path === tool);

  return (
    <Page title={t("Internal")} subtitle={current ? t(current.description) : undefined}>
      <div className="grid h-full min-h-0 grid-cols-[320px_minmax(0,1fr)] gap-5">
        <nav className="flex flex-col gap-2">
          {internalItems.map((item) => (
            <NavLink
              key={item.path}
              to={`/internal/${item.path}`}
              className={({ isActive }) =>
                cn(
                  "flex min-h-[72px] items-center gap-3 rounded-xl border px-5 text-left transition-colors",
                  isActive ? "border-ink bg-ink text-white" : "border-line bg-panel hover:bg-surface",
                )
              }
            >
              {({ isActive }) => (
                <>
                  <div className="min-w-0 flex-1">
                    <div className="text-[16px] font-semibold">{t(item.label)}</div>
                    <div className={cn("truncate text-[12.5px]", isActive ? "text-white/60" : "text-muted")}>{t(item.description)}</div>
                  </div>
                  <ChevronRight className={cn("size-5 shrink-0", isActive ? "text-white/70" : "text-faint")} />
                </>
              )}
            </NavLink>
          ))}
        </nav>
        <div className="min-h-0">{Tool ? <Tool /> : <EmptyState title={t("Unknown tool")} />}</div>
      </div>
    </Page>
  );
}
