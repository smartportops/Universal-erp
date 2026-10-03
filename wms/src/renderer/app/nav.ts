import { ArrowDownToLine, ClipboardList, LayoutDashboard, PackageCheck, Settings, Undo2, Warehouse, type LucideIcon } from "lucide-react";

export type NavItem = { path: string; label: string; icon: LucideIcon; key: string };

/** Main navigation. The `key` is the global F-key shortcut shown in the sidebar. */
export const navItems: NavItem[] = [
  { path: "/", label: "Dashboard", icon: LayoutDashboard, key: "F1" },
  { path: "/receiving", label: "Goods receipt", icon: ArrowDownToLine, key: "F2" },
  { path: "/picklists", label: "Pick lists", icon: ClipboardList, key: "F3" },
  { path: "/fastship", label: "Fast Ship", icon: PackageCheck, key: "F4" },
  { path: "/internal", label: "Internal", icon: Warehouse, key: "F5" },
  { path: "/returns", label: "Returns", icon: Undo2, key: "F6" },
  { path: "/settings", label: "Settings", icon: Settings, key: "F7" },
];

export type InternalItem = { path: string; label: string; description: string };

export const internalItems: InternalItem[] = [
  { path: "transfer", label: "Stock transfer", description: "Move units from one bin to another" },
  { path: "count", label: "Stock count", description: "Count a bin and book the differences" },
  { path: "adjust", label: "Inventory adjustment", description: "Correct stock with a reason" },
  { path: "condition", label: "Change item condition", description: "Mark units as B-stock, damaged or blocked" },
  { path: "bins", label: "Manage bins", description: "Bins, zones and bin types" },
  { path: "articles", label: "Articles", description: "Search articles and see where they are" },
];
