export const permissions = [
  "catalog.write",
  "purchasing.write",
  "sales.write",
  "stock.write",
  "fulfillment.write",
  "finance.write",
  "settings.write",
  "comments.write",
] as const;

export type Permission = (typeof permissions)[number];

export const permissionLabels: Record<Permission, string> = {
  "catalog.write": "Catalog",
  "purchasing.write": "Purchasing",
  "sales.write": "Sales",
  "stock.write": "Stock",
  "fulfillment.write": "Fulfillment",
  "finance.write": "Finance",
  "settings.write": "Settings",
  "comments.write": "Notes",
};

export const roles = [
  "owner",
  "admin",
  "operations",
  "warehouse",
  "finance",
  "viewer",
] as const;

export type Role = (typeof roles)[number];

export const roleLabels: Record<Role, string> = {
  owner: "Owner",
  admin: "Admin",
  operations: "Operations",
  warehouse: "Warehouse",
  finance: "Finance",
  viewer: "Viewer",
};

const grants: Record<Role, readonly Permission[]> = {
  owner: permissions,
  admin: permissions,
  operations: [
    "catalog.write",
    "purchasing.write",
    "sales.write",
    "stock.write",
    "fulfillment.write",
    "comments.write",
  ],
  warehouse: ["stock.write", "fulfillment.write", "comments.write"],
  finance: ["finance.write", "comments.write"],
  viewer: [],
};

export function isRole(value: string): value is Role {
  return (roles as readonly string[]).includes(value);
}

export function can(role: string, permission: Permission) {
  if (!isRole(role)) return false;
  return grants[role].includes(permission);
}

export function grantsFor(role: string) {
  if (!isRole(role)) return [];
  return grants[role];
}
