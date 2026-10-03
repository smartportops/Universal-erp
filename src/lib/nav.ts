export type NavIcon =
  | "dashboard"
  | "products"
  | "customers"
  | "orders"
  | "suppliers"
  | "purchasing"
  | "reorder"
  | "movements"
  | "warehouses"
  | "shipments"
  | "returns"
  | "invoices"
  | "books"
  | "reports"
  | "documents"
  | "activities"
  | "settings"
  | "inbox";

export type NavItem = { href: string; label: string; icon: NavIcon };

export const navigation: { label?: string; items: NavItem[] }[] = [
  {
    items: [
      { href: "/", label: "Overview", icon: "dashboard" },
      { href: "/sales-orders", label: "Orders", icon: "orders" },
      { href: "/products", label: "Products", icon: "products" },
      { href: "/customers", label: "Customers", icon: "customers" },
    ],
  },
  {
    label: "Warehouse",
    items: [
      { href: "/stock", label: "Stock movements", icon: "movements" },
      { href: "/shipments", label: "Shipments", icon: "shipments" },
      { href: "/returns", label: "Returns", icon: "returns" },
      { href: "/warehouses", label: "Warehouses", icon: "warehouses" },
    ],
  },
  {
    label: "Purchasing",
    items: [
      { href: "/reorder", label: "Reorder suggestions", icon: "reorder" },
      { href: "/purchase-orders", label: "Purchase orders", icon: "purchasing" },
      { href: "/suppliers", label: "Suppliers", icon: "suppliers" },
    ],
  },
  {
    label: "Finance",
    items: [
      { href: "/invoices", label: "Invoices", icon: "invoices" },
      { href: "/vouchers", label: "Vouchers", icon: "documents" },
      { href: "/bookkeeping", label: "Bookkeeping", icon: "books" },
      { href: "/reports", label: "Reports", icon: "reports" },
    ],
  },
];

export const secondaryNavigation: NavItem[] = [
  { href: "/settings", label: "Settings", icon: "settings" },
];

export const flatNavigation = [
  { href: "/inbox", label: "Inbox", icon: "inbox" },
  ...navigation.flatMap((group) => group.items),
  ...secondaryNavigation,
];

export function entityHref(type: string, id: string) {
  const bases: Record<string, string> = {
    product: "/products/",
    customer: "/customers/",
    supplier: "/suppliers/",
    sales_order: "/sales-orders/",
    purchase_order: "/purchase-orders/",
    shipment: "/shipments/",
    return: "/returns/",
    invoice: "/invoices/",
    voucher: "/vouchers/",
    warehouse: "/warehouses/",
  };
  const base = bases[type];
  return base ? `${base}${id}` : null;
}
