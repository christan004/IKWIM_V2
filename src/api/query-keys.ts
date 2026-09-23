import type { QueryClient } from '@tanstack/react-query'

/**
 * Every query key in the app, in one place.
 *
 * Features import these rather than writing `['stock']` inline, so a mutation
 * that affects another feature's data cannot drift out of step with the key
 * that feature actually uses.
 *
 * ⚠️ **Some keys are prefixes of others**, and TanStack Query matches by
 * prefix. `orders` is a prefix of `orderPlans`, `items` of `units`, and
 * `suppliers` of `supplierTypes` — so invalidating the shorter key also
 * invalidates the longer one. That is harmless (a refetch of fresh data), but
 * it is why those pairs are not listed as explicit dependants below.
 */
export const QK = {
  authorizers: ['authorizers'],
  cargo: ['cargo'],
  cargoInvoices: ['cargo-invoices'],
  centralStock: ['central-stock'],
  clientWallets: ['client-wallets'],
  clients: ['clients'],
  discounts: ['discounts'],
  companyAccounts: ['company-accounts'],
  // The route is `/clearing-agents`; the module is `clearance.agent`.
  clearanceAgents: ['clearing-agents'],
  currencies: ['currencies'],
  cuves: ['cuves'],
  deports: ['deports'],
  displays: ['displays'],
  drivers: ['drivers'],
  items: ['items'],
  itemToleranceRates: ['item-tolerance-rates'],
  modulesList: ['modules', 'list'],
  modulesSidebar: ['modules', 'sidebar'],
  nominations: ['nominations'],
  nozzles: ['nozzles'],
  orderPlans: ['orders', 'order-plan'],
  orders: ['orders'],
  pfi: ['pfi'],
  pumps: ['pumps'],
  reports: ['supply-chain-report'],
  roles: ['roles'],
  sites: ['sites'],
  stock: ['stock'],
  stockoutOrders: ['stock-out-orders'],
  supplierTypes: ['suppliers', 'supplier-type'],
  suppliers: ['suppliers'],
  t1Validation: ['t1-validation'],
  transporters: ['transporters'],
  units: ['items', 'units'],
  users: ['users'],
  vehicles: ['vehicles'],
} as const satisfies Record<string, readonly string[]>

type Domain = keyof typeof QK

/**
 * What else changes when a domain is written to.
 *
 * These are **not** import relationships — they are cases where the API returns
 * a field derived from another domain, so writing one makes the other's cached
 * response wrong. Each entry is justified by a field observed in a live
 * response:
 *
 * | writing… | also stale | because |
 * | --- | --- | --- |
 * | `cargo` | `orders` | orders carry `stockCargos`, `remainingStock`, `cargos[]` |
 * | `cargo` | `stock` | stock lines embed their `cargo` and its status |
 * | `cargo` | `cargoInvoices` | invoices are listed per cargo |
 * | `cargoInvoices` | `cargo` | cargo rows carry a `cargoInvoices[]` array |
 * | `stock` | `cargo` | cargo carries a `stocks[]` array |
 * | `stock` | `orders` | `remainingStock` is derived from **stock**, not cargo |
 * | `nominations` | `stock` | stock lines carry `nominatedQuantity`, `remainingQuantity`, `nominations[]` |
 * | `nominations` | `pfi`, `t1Validation` | both hang off a nomination |
 * | `t1Validation` | `nominations` | the timeline's `t1Pending` / `t1Confirmed` stages |
 * | `centralStock` | `nominations` | the timeline's `stockReceived` stage |
 * | `centralStock` | `stock`, `t1Validation` | central stock is raised from a confirmed T1 |
 * | `stockoutOrders` | `centralStock`, `stock` | `soldOutQuantity` is drawn down by a stockout |
 * | `pfi` | `nominations` | a nomination's PFI state follows it |
 * | `orders` | `cargo` | cargo rows embed their `order` and its quantity |
 * | `suppliers`, `items` | `orders` | orders nest `supplier` and `item` |
 *
 * A redundant refetch is cheap; a stale figure that contradicts another page is
 * not. Where a relationship was inferred rather than observed it is marked in
 * the table above and in the README.
 */
const DEPENDANTS: Partial<Record<Domain, readonly Domain[]>> = {
  // An authorizer decides who may approve a stockout, so the orders list — and
  // its approval trail — reflects any change here.
  authorizers: ['stockoutOrders'],
  cargo: ['orders', 'stock', 'cargoInvoices'],
  // An invoice is listed per shipment and cargo rows carry a `cargoInvoices[]`
  // array, so the cargo list is stale the moment one is raised or removed.
  cargoInvoices: ['cargo'],
  // A wallet belongs to a client organisation, so opening one changes what the
  // clients page can offer.
  clientWallets: ['clients'],
  clients: ['clientWallets'],
  // A central-stock clearance names its agent, so renaming one or changing its
  // fee changes what that page displays.
  clearanceAgents: ['centralStock'],
  centralStock: ['nominations', 'stock', 't1Validation'],
  cuves: ['nozzles', 'sites'],
  displays: ['nozzles', 'pumps'],
  drivers: ['nominations', 'vehicles'],
  items: ['stock', 'centralStock', 'orders'],
  // A rate is a property of an item and is shown on the items table, so the
  // item list is stale the moment one is set or changed.
  itemToleranceRates: ['items'],
  nominations: ['stock', 'pfi', 't1Validation'],
  nozzles: ['pumps', 'cuves'],
  // Cargo rows embed their `order` (including its quantity), so editing an
  // order makes the cargo list stale.
  orders: ['cargo'],
  pfi: ['nominations'],
  pumps: ['sites', 'displays', 'nozzles'],
  sites: ['pumps', 'cuves', 'displays', 'nozzles', 'users'],
  stock: ['cargo', 'orders', 'nominations'],
  stockoutOrders: ['centralStock', 'stock'],
  // Orders nest `supplier` and `item`, so both are stale when those change.
  suppliers: ['orders'],
  t1Validation: ['nominations', 'centralStock'],
  units: ['items'],
  vehicles: ['drivers'],
}

/**
 * Refresh a domain and everything that displays data derived from it.
 *
 * ```ts
 * onSuccess: () => invalidate(queryClient, 'cargo')
 * ```
 *
 * `extraKeys` covers per-record keys the map cannot know, such as the detail
 * query for the row just edited.
 */
export function invalidate(
  queryClient: QueryClient,
  domain: Domain,
  extraKeys: readonly (readonly unknown[])[] = [],
) {
  // The domain itself first, so its own list is always refreshed even if the
  // dependency map has no entry for it.
  queryClient.invalidateQueries({ queryKey: QK[domain] })

  for (const dependant of DEPENDANTS[domain] ?? []) {
    queryClient.invalidateQueries({ queryKey: QK[dependant] })
  }

  for (const key of extraKeys) {
    queryClient.invalidateQueries({ queryKey: key })
  }
}
