import {
  BadgeCheck,
  Blocks,
  BriefcaseBusiness,
  Boxes,
  Building2,
  CalendarRange,
  ClipboardList,
  ClipboardCheck,
  Cog,
  Contact,
  ChartColumn,
  ChartLine,
  Container,
  Droplets,
  FileSpreadsheet,
  FileSignature,
  Forklift,
  Fuel,
  Gauge,
  HandCoins,
  IdCard,
  Layers,
  Landmark,
  MapPin,
  MonitorSmartphone,
  PackageOpen,
  PackagePlus,
  PackageSearch,
  Percent,
  ReceiptText,
  Route,
  Ruler,
  Settings,
  ShieldCheck,
  ShoppingCart,
  Ship,
  SlidersHorizontal,
  Stamp,
  Store,
  Tags,
  Truck,
  UserCheck,
  Users,
  Wallet,
  Warehouse,
  Workflow,
  Wrench,
  type LucideIcon,
} from 'lucide-react'

/**
 * Maps a module `code` from the backend's module tree to the route it opens and
 * the icon it shows.
 *
 * The API returns no path or icon, so this table is the seam between the
 * backend's module tree and the frontend's routes. **This is the one file to
 * edit when the backend adds a module.**
 *
 * A code with no entry here still renders — as a non-clickable label if it has
 * children, or a disabled item if it is a leaf. That way a new backend module
 * never disappears silently; it shows up visibly unwired.
 */
export interface ModuleRoute {
  path?: string
  icon?: LucideIcon
  /** Heading for the placeholder screen until the real page is built. */
  title?: string
  /**
   * Mapped, but kept out of the sidebar.
   *
   * For a backend module whose UI lives inside another page rather than on one
   * of its own — listing it would either duplicate an existing link or offer a
   * dead one. Distinct from having no entry at all, which renders as visibly
   * unwired so a new module never disappears silently.
   */
  hidden?: boolean
}

export const MODULE_REGISTRY: Record<string, ModuleRoute> = {
  // Grouping nodes — they have children and no page of their own.
  GENERAL_SETTINGS: { icon: Settings },
  SYSTEM_SETTINGS: { icon: Cog },

  // Screens under General Settings > System Settings.
  MODULES: { path: '/modules', icon: Blocks, title: 'Modules' },
  ROLES: { path: '/roles', icon: ShieldCheck, title: 'Roles' },
  USERS: { path: '/users', icon: Users, title: 'Users' },
  ITEMS: { path: '/items', icon: Boxes, title: 'Items' },
  UNITS: { path: '/units', icon: Ruler, title: 'Units' },
  // Sits under System Settings in the live tree, beside Users and Roles.
  COMPANY_ACCOUNT: { path: '/company-accounts', icon: Landmark, title: 'Company accounts' },
  // Sits under System Settings in the live tree, beside Users and Roles.
  CLIENTS: { path: '/clients', icon: Contact, title: 'Clients' },

  // Client management — the module and its Wallets service are grouping nodes,
  // so they carry an icon but no path of their own.
  CLIENT_MANAGEMENT: { icon: BriefcaseBusiness },
  WALLETS: { icon: HandCoins },
  CLIENT_WALLETS: { path: '/client-wallets', icon: Wallet, title: 'Client wallets' },

  DISCOUNTS: { path: '/discounts', icon: Percent, title: 'Discounts' },

  /*
   * Live sidebar nodes with no page built yet. They are registered for their
   * icon alone: a leaf without one falls back to a bullet, but a **module**
   * falls back to a blank spacer, so the row looks misaligned rather than
   * obviously unwired. Give each a `path` when its screen exists.
   */
  // Grouping nodes under the PSS branch.
  PSS_GENERAL_SETTINGS: { icon: Wrench },
  PSS_STOCK: { icon: PackagePlus },
  // Sits beside Central Stock under Stock Management → PSS Stock.
  LOADING_ORDERS: { path: '/loading-orders', icon: Forklift, title: 'Loading orders' },
  STOCK_MANAGEMENT: { icon: PackageSearch },
  PSS_STOCK_MANAGEMENT: { icon: ClipboardCheck },

  // Supply chain — grouping nodes carry no path of their own.
  SUPPLY_CHAIN_SETTINGS: { icon: SlidersHorizontal },
  // Neither Warehouse nor Truck: the DEPORTS and VEHICLES leaves below own
  // those. An icon repeated inside one branch stops distinguishing rows.
  SUPPLY_CHAIN_IMPORT_TRANSIT_DEPOT_AND_WAREHOUSE: { icon: Route },
  // Sits alongside Suppliers under Supply Chain Settings, per the live tree.
  CLEARANCE_AGENT: {
    path: '/clearance-agents',
    icon: UserCheck,
    title: 'Clearance agents',
  },
  SUPPLIERS: { path: '/suppliers', icon: Building2, title: 'Suppliers' },
  SUPPLIERS_TYPE: { path: '/suppliers/types', icon: Tags, title: 'Supplier types' },
  SUPPLY_CHAIN: { icon: Workflow },

  // Orders
  ORDERS: { path: '/orders', icon: ClipboardList, title: 'Orders' },
  ORDERS_PLAN: { path: '/orders/plans', icon: CalendarRange, title: 'Order plans' },

  // Logistics
  DEPORTS: { path: '/deports', icon: Warehouse, title: 'Deports' },
  DRIVERS: { path: '/drivers', icon: IdCard, title: 'Drivers' },
  VEHICLES: { path: '/vehicles', icon: Truck, title: 'Vehicles' },
  TRANSPORTERS: { path: '/transporters', icon: Container, title: 'Transporters' },

  // PSS — the module and its service are grouping nodes, so they carry an icon
  // but no path of their own.
  PSS_OPERATION_FORECOURT_SERVICE_BAY_SHOP_CAR_WASH: { icon: Store },
  PSS_OPERATION_FORECOURT: { icon: Fuel },

  // Supply chain operations
  CARGO: { path: '/cargo', icon: Ship, title: 'Cargo' },
  /*
   * No page of its own: invoices are raised and listed on the cargo row they
   * belong to. Hidden rather than dropped — the backend still returns the node,
   * and an unmapped code would render as visibly unwired, while a second link
   * to /cargo would highlight alongside Cargo itself.
   */
  CARGO_INVOICE: { icon: FileSpreadsheet, title: 'Cargo Invoice', hidden: true },
  NOMINATIONS: { path: '/nominations', icon: FileSignature, title: 'Nominations' },
  PFI: { path: '/pfi', icon: ReceiptText, title: 'PFI' },
  T1_VALIDATION: { path: '/t1-validation', icon: BadgeCheck, title: 'T1 Validation' },
  CENTRAL_STOCK: { path: '/central-stock', icon: PackageOpen, title: 'Central stock' },

  // Reports. The grouping node has no page of its own; the two leaves do.
  SUPPLY_CHAIN_REPORT: { icon: ChartColumn },
  ORDER_REPORT: { path: '/reports/orders', icon: ChartColumn, title: 'Order report' },
  CENTRAL_STOCK_REPORT: {
    path: '/reports/central-stock',
    icon: ChartLine,
    title: 'Central stock report',
  },
  // The service above already uses Fuel, so the sites leaf takes its own icon
  // rather than repeating its parent's within the same branch.
  PSS: { path: '/pss', icon: MapPin, title: 'PSS' },
  STOCKOUT_ORDERS: { path: '/stockout-orders', icon: ShoppingCart, title: 'Stockout orders' },
  // Sits beside Stockout orders under PSS Stock Management, per the live tree.
  AUTHORIZERS: { path: '/authorizers', icon: Stamp, title: 'Authorizers' },
  PUMP: { path: '/pumps', icon: Gauge, title: 'Pumps' },
  DISPLAY: { path: '/displays', icon: MonitorSmartphone, title: 'Displays' },
  CUVE: { path: '/cuves', icon: Container, title: 'Cuves' },
  NOZZLE: { path: '/nozzles', icon: Droplets, title: 'Nozzles' },
  STOCK: { path: '/stock', icon: Layers, title: 'Stock' },
}

export function moduleRoute(code: string): ModuleRoute | undefined {
  return MODULE_REGISTRY[code]
}

/**
 * Every registered path, for generating routes. Keeping this derived from the
 * registry means a sidebar link can never point at a route that doesn't exist.
 */
export function registeredRoutes(): Array<{ code: string; path: string; title: string }> {
  return Object.entries(MODULE_REGISTRY)
    .filter((entry): entry is [string, ModuleRoute & { path: string }] => Boolean(entry[1].path))
    .map(([code, route]) => ({ code, path: route.path, title: route.title ?? code }))
}
