export const ROLES = {
  admin: 'Founder / admin',
  sales_manager: 'Sales manager',
  sales_exec: 'Sales executive',
  procurement_manager: 'Procurement manager',
  procurement_exec: 'Procurement executive',
  packing_quality: 'Packing / quality',
  dispatch: 'Dispatch',
  finance: 'Finance',
} as const;
export type Role = keyof typeof ROLES;

/** Permission map. '*' = everything. Enforced server-side by `requirePerm` and by scoped queries. */
const MAP: Record<Role, string[]> = {
  admin: ['*'],
  sales_manager: ['sales.all', 'sales.write', 'sales.assign', 'quotes.approve', 'orders.view_all', 'orders.write', 'costing.view', 'margin.view', 'vendors.view', 'approvals.sales', 'reports.view', 'feasibility.override', 'tasks.assign'],
  sales_exec: ['sales.write', 'costing.view', 'orders.write', 'tasks.assign', 'reports.sales'],
  procurement_manager: ['procurement.write', 'procurement.all', 'vendors.view', 'vendors.write', 'vendors.approve', 'orders.view_all', 'orders.write', 'costing.view', 'margin.view', 'receiving.write', 'procurement.override', 'approvals.procurement', 'reports.view', 'feasibility.write', 'tasks.assign'],
  procurement_exec: ['procurement.write', 'vendors.view', 'vendors.write', 'costing.view', 'receiving.write', 'feasibility.write'],
  packing_quality: ['receiving.write', 'quality.write', 'packing.write', 'vendors.view.basic'],
  dispatch: ['shipments.write', 'orders.view_dispatch'],
  finance: ['finance.view', 'finance.write', 'margin.view', 'costing.view', 'vendors.view', 'vendors.sensitive', 'vendors.verify', 'export', 'orders.view_all', 'reports.view', 'approvals.finance'],
};

export interface AuthUser { id: number; name: string; email: string; roles: Role[] }

export function permsOf(roles: Role[]): Set<string> {
  const s = new Set<string>();
  for (const r of roles) for (const p of MAP[r] ?? []) s.add(p);
  return s;
}
export function can(user: AuthUser, perm: string): boolean {
  const p = permsOf(user.roles);
  return p.has('*') || p.has(perm);
}
export function canAny(user: AuthUser, ...perms: string[]) { return perms.some((p) => can(user, p)); }
export function hasRole(user: AuthUser, ...roles: Role[]) { return user.roles.some((r) => roles.includes(r)); }
export function allPermissions(user: AuthUser): string[] {
  const p = permsOf(user.roles);
  return p.has('*') ? ['*'] : [...p];
}
