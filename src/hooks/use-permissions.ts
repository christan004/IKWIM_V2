import { useMemo } from 'react'
import { useAuthStore } from '@/stores/auth-store'

/**
 * Permission codes are `<module>.<action>`, where the module part may itself
 * contain dots — `suppliers.type.read` is the `read` action on
 * `suppliers.type`. Five actions are generated per module.
 */
export type PermissionAction = 'read' | 'create' | 'edit' | 'delete' | 'manage'

/**
 * `<module>.manage` grants every action on that module, so holding it satisfies
 * a `read`, `create`, `edit`, or `delete` check without those codes being
 * listed. The Administrator role relies on this: it holds `roles.manage` alone,
 * yet must still pass a `roles.read` check.
 */
function grants(held: Set<string>, moduleCode: string, action: PermissionAction): boolean {
  if (held.has(`${moduleCode}.${action}`)) return true
  return held.has(`${moduleCode}.manage`)
}

export function usePermissions() {
  const permissions = useAuthStore((s) => s.permissions)

  return useMemo(() => {
    const held = new Set(permissions)

    /** True when the user can perform `action` on `moduleCode`. */
    const can = (moduleCode: string, action: PermissionAction) =>
      grants(held, moduleCode, action)

    /** True when the user holds a specific code, ignoring the manage rule. */
    const hasExact = (code: string) => held.has(code)

    /**
     * Everything a page needs for one module, so a component asks once rather
     * than repeating `can(MODULE, …)` at every button.
     */
    const forModule = (moduleCode: string) => ({
      canRead: grants(held, moduleCode, 'read'),
      canCreate: grants(held, moduleCode, 'create'),
      canEdit: grants(held, moduleCode, 'edit'),
      canDelete: grants(held, moduleCode, 'delete'),
      canManage: held.has(`${moduleCode}.manage`),
    })

    return { permissions, held, can, hasExact, forModule }
  }, [permissions])
}

/** Module codes used for permission checks, kept in one place. */
export const PERMISSION_MODULES = {
  modules: 'modules',
  roles: 'roles',
  users: 'users',
  units: 'units',
  items: 'items',
  suppliers: 'suppliers',
  supplierTypes: 'suppliers.type',
  /**
   * ⚠️ Dotted, and it does **not** match its own route: the module code is
   * `CLEARANCE_AGENT` while the endpoint is `/clearing-agents`.
   */
  clearanceAgents: 'clearance.agent',
  orders: 'orders',
  orderPlans: 'orders.plan',
  deports: 'deports',
  transporters: 'transporters',
  vehicles: 'vehicles',
  drivers: 'drivers',
  cargo: 'cargo',
  /** ⚠️ Dotted, not `cargo_invoice` — the module code is `CARGO_INVOICE`. */
  cargoInvoices: 'cargo.invoice',
  stock: 'stock',
  nominations: 'nominations',
  /** Currencies share this — `/pfi/currency` has no module of its own. */
  pfi: 'pfi',
  /** ⚠️ Dotted — the module code is `ORDER_REPORT`, under Supply Chain Report. */
  orderReport: 'order.report',
  /** ⚠️ Dotted likewise — `CENTRAL_STOCK_REPORT`, under PSS Stock. */
  centralStockReport: 'central.stock.report',
  /** ⚠️ Dotted — `T1_VALIDATION`. */
  t1Validation: 't1.validation',
  /** ⚠️ Dotted likewise — the module code is `CENTRAL_STOCK`. */
  centralStock: 'central.stock',
  /** Sites, under PSS Operation Forecourt. Module code `PSS`. */
  pss: 'pss',
  /** Pumps — a sibling of PSS with its own permissions. */
  pump: 'pump',
  /** ⚠️ Dotted — the module code is `STOCKOUT_ORDERS`. */
  stockoutOrders: 'stockout.orders',
  /** Who may sign off a stockout. Its own module, despite the nested route. */
  authorizers: 'authorizers',
  /** Loading orders — its own module, despite the nested route. */
  loadingOrders: 'loading.orders',
  /** ⚠️ Dotted — the module code is `COMPANY_ACCOUNT`, singular. */
  companyAccounts: 'company.account',
  /** Client users and the organisations they belong to. */
  clients: 'clients',
  /**
   * ⚠️ Two permission families exist — `client.wallets.*` and `wallets.*` — and
   * the superAdmin holds both. The dotted one matches the module code, so it is
   * the one used here.
   */
  clientWallets: 'client.wallets',
  /** Fixed (per client) and ranging (per volume tier) discounts. */
  discounts: 'discounts',
  /** Displays — likewise a sibling, not a child of PUMP. */
  display: 'display',
  /** Cuves (storage tanks) — another sibling under PSS Operation Forecourt. */
  cuve: 'cuve',
  /** Nozzles — the join point of pump, display and cuve. */
  nozzle: 'nozzle',
} as const
