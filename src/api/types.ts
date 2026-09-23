// Hand-written request/response types for the PetroX API.
//
// The backend (Fastify) does not expose an OpenAPI/Swagger document, so unlike
// the previous console there is no orval codegen step — these are kept by hand
// and mirror the payloads the API actually returns. If a spec is added later,
// this file is the seam to replace with generated types.

/** Success envelope wrapped around every 2xx payload. */
export interface ApiEnvelope<T> {
  success: true
  data: T
}

export interface ApiErrorDetail {
  field: string
  code: string
  message: string
}

/** Failure envelope returned on every non-2xx response. */
export interface ApiErrorEnvelope {
  success: false
  error: {
    statusCode: number
    code: string
    message: string
    requestId?: string
    details?: ApiErrorDetail[]
  }
}

/**
 * A list response that may arrive **either** as a bare array or as a paginated
 * envelope.
 *
 * Several endpoints have switched between the two mid-development —
 * `/suppliers`, `/suppliers/supplier-type`, `/drivers` and `/modules/list` have
 * each flipped at least once. A hook typed rigidly to one shape renders **zero
 * rows** against the other, with no error: the request still returns `200`, and
 * `.map()` over an object simply yields nothing.
 *
 * Use `listRows()` to read one of these safely.
 */
export type ListResponse<T> = T[] | Paginated<T>

/**
 * The rows of a list response, whichever shape it arrived in.
 *
 * ```ts
 * const { data } = useQuery(...)
 * const rows = listRows(data)   // works for both shapes
 * ```
 */
export function listRows<T>(data: ListResponse<T> | undefined): T[] {
  if (!data) return []
  if (Array.isArray(data)) return data
  return data.items ?? []
}

/** Paginated list envelope used by /users, /roles, and other collections. */
export interface Paginated<T> {
  items: T[]
  pagination: {
    page: number
    pageSize: number
    total: number
    totalPages: number
    hasNextPage: boolean
    hasPreviousPage: boolean
  }
}

/* ------------------------------------------------------------------ */
/* Auth                                                                */
/* ------------------------------------------------------------------ */

/** Roles are dynamic on the backend, so a user's role is just its name. */
export type Role = string

/** One site assigned to a user, as `AuthUser.sites` and `User.sites` return it. */
export interface AssignedSite {
  siteId: string
  /** The assignment's status, not the site's — though both are `active` here. */
  status: UnitStatus
  /** The full site record, so its name needs no second request. */
  site: Site
}

export interface AuthUser {
  id: string
  email: string
  firstName: string
  lastName: string
  role: Role
  /**
   * Drives what the signed-in user may pick. `superAdmin` is unrestricted;
   * everyone else is limited to their own `sites`.
   */
  position?: UserPosition | null
  /**
   * The sites this user is assigned to. **Empty for a `superAdmin`** — they are
   * not scoped to any, which is exactly why they may choose freely.
   *
   * ⚠️ Note the shape: an array of *assignments*, each wrapping a full `site` —
   * not a bare `siteId`. Login and refresh both return it.
   */
  sites?: AssignedSite[]
}

export interface LoginRequest {
  email: string
  password: string
}

/**
 * Payload of both POST /auth/login and POST /auth/refresh.
 *
 * ⚠️ **No tokens.** Authentication is cookie-based: the API sets `access_token`
 * and `refresh_token` as `HttpOnly` cookies, so the body carries only who is
 * signed in and what they may do. `accessToken`/`refreshToken`/`expiresAt` used
 * to be here and are gone.
 *
 * Refresh returns the user and permissions too, which is what lets the app
 * restore a session without a /auth/me endpoint (the API has none).
 */
export interface AuthSession {
  user: AuthUser
  permissions: string[]
}

/**
 * POST /auth/password-reset/request.
 *
 * The API currently echoes the reset `token` here. The client deliberately
 * never reads it — the token belongs in the emailed link only. See the security
 * note in the README.
 */
export interface PasswordResetRequestResponse {
  token?: string
  expiresAt: string
}

/* ------------------------------------------------------------------ */
/* Modules (sidebar)                                                   */
/* ------------------------------------------------------------------ */

/**
 * One node of GET /modules/sidebar. The API returns a recursive tree; the depth
 * a node sits at is what gives it meaning:
 *
 *   depth 0 — module   (a top-level sidebar section)
 *   depth 1 — service  (a group within a module)
 *   depth 2 — feature  (a leaf that navigates somewhere)
 *
 * Nothing in the payload states the level, so `ModuleLevel` is derived while
 * walking the tree rather than read from a field.
 */
export interface SidebarModule {
  id: string
  name: string
  code: string
  sorting: number
  children: SidebarModule[]
}

export type ModuleLevel = 'module' | 'service' | 'feature'

/** A permission generated for a module. Five are created per module. */
export interface ModulePermission {
  id: string
  moduleId: string
  name: string
  /** Dotted code, e.g. `supply.chain.read`. */
  code: string
  description: string | null
  createdAt: string
}

/**
 * One node of GET /modules/list — the full record, unlike /modules/sidebar
 * which omits `permissions` and `parentId` and hides some modules entirely.
 */
export interface ModuleListNode {
  id: string
  name: string
  icon: string | null
  code: string
  parentId: string | null
  sorting: number
  createdAt: string
  permissions: ModulePermission[]
  children: ModuleListNode[]
}

/**
 * One entry of `PUT /modules/change-module/sorting`, which takes an **array**.
 *
 * Ordering is **per level**: a module, its service and its feature can each be
 * `1`, because siblings compete only with each other. Whole levels are sent at
 * once so their numbers stay contiguous.
 *
 * ⚠️ `sortingNumber` is validated as a **number greater than zero** — `0` is
 * rejected with `Too small`, so the sequence is 1-based. A numeric string is
 * coerced, but a number is sent for clarity.
 */
export interface ModuleSortingEntry {
  /** The module's id. Named `categoryId`, not `moduleId`. */
  categoryId: string
  sortingNumber: number
}

/** One item in the POST /modules/create array. */
export interface CreateModuleRequest {
  name: string
  /** Lucide icon name, e.g. "Ship". Stored as-is; may be null. */
  icon?: string | null
  /** Omit or null to create a top-level module. */
  parentId?: string | null
}

/**
 * The body of `PUT /modules/edit/:id`.
 *
 * ⚠️ **The id goes in the path, not the body.** A body `id` is accepted but
 * ignored — the path is what selects the record.
 *
 * ⚠️ **Only `name` is required.** `icon` is optional and accepts `null` or an
 * empty string. `code` is *not* editable: sending it is validated
 * (`>=2 characters`) and then ignored, since the backend derives it from the
 * name at creation time.
 */
export interface UpdateModuleRequest {
  name: string
  /** Lucide icon name, e.g. "Ship". May be null. */
  icon?: string | null
}

/**
 * A module as returned by POST /modules/create. Note `code` is derived from the
 * name by the backend ("Supply Chain" -> "SUPPLY_CHAIN") and is not accepted as
 * an input.
 */
export interface ModuleRecord {
  id: string
  name: string
  icon: string | null
  code: string
  parentId: string | null
  sorting: number
  createdAt: string
}

/* ------------------------------------------------------------------ */
/* Users & roles                                                       */
/* ------------------------------------------------------------------ */

export interface RoleRef {
  id: string
  name: string
}

/* ------------------------------------------------------------------ */
/* Items — units of measure                                            */
/* ------------------------------------------------------------------ */

export type UnitStatus = 'active' | 'inactive'

/**
 * `GET /items/units` returns only these four fields — it does **not** include
 * `createdAt`/`updatedAt`, though the create, update, and status responses do.
 */
export interface Unit {
  id: string
  name: string
  /** Short symbol, e.g. "KG". Not enforced unique by the API. */
  code: string
  status: UnitStatus
  createdAt?: string
  updatedAt?: string
}

export interface UnitRequest {
  name: string
  code: string
}

/* ------------------------------------------------------------------ */
/* Suppliers — types                                                   */
/* ------------------------------------------------------------------ */

/**
 * A supplier classification, e.g. FOREIGN or LOCAL. The list and detail
 * endpoints return the same three fields — no timestamps.
 */
export interface SupplierType {
  id: string
  type: string
  status: UnitStatus
}

export interface SupplierTypeRequest {
  type: string
}

/* ------------------------------------------------------------------ */
/* Discounts                                                           */
/* ------------------------------------------------------------------ */

/**
 * How a discount is calculated — **and the discriminator for the whole body**,
 * not merely a field.
 *
 * | type | targets | carries |
 * | --- | --- | --- |
 * | `fixed` | one **client** (`clientId` required) | a single `value` |
 * | `ranging` | volume tiers, **no client** | `rangingDiscounts[]` |
 *
 * 🔴 A `ranging` discount **rejects `clientId` outright** — `Unrecognized key:
 * "clientId"` — so it is not merely optional. The two branches must be built
 * separately rather than sharing one object.
 */
export const DISCOUNT_TYPES = ['fixed', 'ranging'] as const
export type DiscountType = (typeof DISCOUNT_TYPES)[number]

/**
 * One volume tier of a `ranging` discount.
 *
 * ⚠️ **Tiers for the same site must not overlap** — `Ranges for the same site
 * must not overlap` — and each needs `to` **greater than** `from`.
 */
export interface RangingDiscount {
  id?: string
  from: number
  to: number
  amount: number
  siteId: string
  status?: UnitStatus
}

/** A discount, as returned by `GET /discounts`. */
export interface Discount {
  id: string
  type: DiscountType
  /** ⚠️ Arrives as a **string**. */
  value: string | number
  status: UnitStatus
  /** Present on `fixed` only. */
  clientId?: string | null
  client?: { id: string; name?: string; clientCode?: string } | null
  siteId?: string | null
  site?: { id: string; name: string } | null
  validFrom: string
  validTo: string
  createdBy?: string
  user?: { id: string; firstName: string; lastName: string; email?: string } | null
  createdAt?: string
  /** Empty on a `fixed` discount. */
  rangingDiscounts?: RangingDiscount[]
}

/**
 * Sent as JSON. A **discriminated union** on `type`.
 *
 * Shared rules, all confirmed live:
 * - `value` must be **> 0**, with at most 11 integer digits and 1 decimal place
 * - `status` is `active | inactive` (lowercase; `ACTIVE` is rejected)
 * - `validTo` must be **later than** `validFrom`
 * - `siteId` is optional on `fixed`, but a **tier** always needs one
 */
export type DiscountRequest =
  | {
      type: 'fixed'
      value: number
      /** Required — a fixed discount belongs to one client. */
      clientId: string
      siteId?: string
      validFrom: string
      validTo: string
      status?: UnitStatus
    }
  | {
      type: 'ranging'
      /** `0` on a ranging discount: the tiers carry the real figures. */
      value: number
      /** 🔴 `clientId` is **rejected** on this branch. */
      siteId?: string
      validFrom: string
      validTo: string
      status?: UnitStatus
      rangingDiscounts: RangingDiscount[]
    }

/* ------------------------------------------------------------------ */
/* Client wallets                                                      */
/* ------------------------------------------------------------------ */

/**
 * A client organisation's wallet.
 *
 * Every route here returned `403 FORBIDDEN` during development, even for a
 * superAdmin holding all six wallet permissions. **Fixed server-side and
 * re-verified** — the list now returns `200` with real wallets.
 */
export interface ClientWallet {
  /** ⚠️ A **CUID**, not a UUID — like company accounts. */
  id: string
  /** ⚠️ The balance is `amount`, and arrives as a **string**. */
  amount: string | number
  clientId?: string
  client?: { id: string; name?: string; clientCode?: string } | null
  /** Who opened it. */
  createdAtBy?: string
  user?: { id: string; firstName: string; lastName: string; email?: string } | null
  status?: UnitStatus
  createdAt?: string
  updatedAt?: string
}

/**
 * What a movement does to the balance.
 *
 * Seven values, confirmed from the API's own rejection listing them all.
 */
export const WALLET_MOVEMENT_TYPES = [
  'DEPOSIT',
  'PAYMENT',
  'REFUND',
  'LOAN',
  'WITHDRAWAL',
  'TRANSFER',
  'ADJUSTMENT',
] as const
export type WalletMovementType = (typeof WALLET_MOVEMENT_TYPES)[number]

/**
 * Query parameters for `GET /client-wallets/:id/movements`.
 *
 * Both optional. An unset one is **omitted entirely** — every other filter in
 * this API validates when present, so a blank string is a rejection rather than
 * "no filter".
 *
 * 🔴 **The endpoint currently returns `500 INTERNAL_ERROR`** — unconditionally,
 * with or without these parameters, and regardless of pagination. It returned
 * `200` earlier while the ledger was empty and began failing once a movement
 * existed, so it is the response that breaks, not the request. The route itself
 * is sound: a well-formed but unknown wallet id still gives a clean
 * `404 Client wallet not found`.
 */
export interface WalletMovementFilter {
  /** ISO 8601 instant. */
  startDate?: string
  endDate?: string
}

/** One movement against a wallet. */
export interface WalletMovement {
  id: string
  type: WalletMovementType
  amount: string | number
  referenceId?: string | null
  accountId?: string | null
  account?: { id: string; code?: string; name?: string } | null
  /** Running balance after this movement, if the API returns one. */
  balanceAfter?: string | number | null
  createdAt?: string
  user?: { id: string; firstName: string; lastName: string } | null
}

/**
 * Sent as JSON to `POST /client-wallets/:id/movements`.
 *
 * 🔴 **`accountId` and `referenceId` are required only for `DEPOSIT`** —
 * *"Company account is required for a deposit"* / *"Reference is required for a
 * deposit"*. The other six types need neither.
 *
 * ⚠️ `amount` is a **string**, must be **> 0**, and takes **at most 2 decimal
 * places** — a number is rejected outright.
 *
 * ⚠️ `accountId` is a **company account CUID** — see `CompanyAccount`.
 */
export interface WalletMovementRequest {
  type: WalletMovementType
  amount: string
  accountId?: string
  referenceId?: string
}

/**
 * Sent as JSON. The documented body is `{ clientId }` alone — the wallet is
 * opened *for* an organisation, so it carries no other input.
 */
export interface ClientWalletRequest {
  clientId: string
}

/* ------------------------------------------------------------------ */
/* Locations                                                           */
/* ------------------------------------------------------------------ */

/**
 * One node of the Rwandan administrative hierarchy.
 *
 * Five levels deep — province, district, sector, cell, village — walked by
 * `GET /locations` (the roots) then `GET /locations/parent/:id` for each level
 * below. Verified live: Kigali -> 3 districts -> 15 sectors -> cells -> villages.
 */
export interface Location {
  id: string
  name: string
  /** `null` on a province, which is what makes it a root. */
  parentId: string | null
  createdAt?: string
  updatedAt?: string
}

/**
 * The three levels a client organisation records.
 *
 * ⚠️ **The API stores these as UUIDs, not names** — sending `"Kigali"` is
 * rejected with `Must be a valid UUID`. They are location ids.
 */
export const LOCATION_LEVELS = ['province', 'district', 'sector'] as const
export type LocationLevel = (typeof LOCATION_LEVELS)[number]

/* ------------------------------------------------------------------ */
/* Clients                                                             */
/* ------------------------------------------------------------------ */

/**
 * Which kind of client user this is — and **the discriminator for the whole
 * request body**, not merely a field.
 *
 * | position | also requires | meaning |
 * | --- | --- | --- |
 * | `clientAdmin` | `clientDetails` | creates the client **organisation** too |
 * | `clientUser` | `clientId` | joins an organisation that already exists |
 *
 * Confirmed by the API's own error: `Invalid discriminator value. Expected
 * 'clientAdmin' | 'clientUser'`.
 */
export const CLIENT_POSITIONS = ['clientAdmin', 'clientUser'] as const
export type ClientPosition = (typeof CLIENT_POSITIONS)[number]

/**
 * A client user, as returned by `GET /clients`.
 *
 * ⚠️ **This lists client *users*, not client organisations.** Several users
 * share one `clientId` — the organisation their `clientAdmin` created.
 *
 * ⚠️ Status is **`isActive` (boolean)**, not the `status: 'active' | 'inactive'`
 * string every other resource here uses.
 */
export interface Client {
  id: string
  email: string
  firstName: string
  lastName: string
  phone?: string | null
  position: ClientPosition
  /** The organisation this user belongs to. Shared across its users. */
  clientId?: string | null
  siteId?: string | null
  isActive: boolean
  role?: { id: string; name: string } | null
  createdAt?: string
  updatedAt?: string
}

/**
 * The organisation created alongside a `clientAdmin`.
 *
 * 🔴 **Only `clientCode`, `pin` and `discountType` are required** — the rest are
 * optional despite appearing in the documented example.
 */
export interface ClientDetails {
  clientCode: string
  pin: string
  discountType: string
  name?: string
  phone?: string
  email?: string
  /** Spelled `idTino` in the API. */
  idTino?: string
  /** ⚠️ Location **UUIDs**, not names — see `LOCATION_LEVELS`. */
  province?: string
  district?: string
  sector?: string
  comments?: string
  subsidyAllowed?: boolean
}

/**
 * Sent as JSON. A **discriminated union** on `position`.
 *
 * 🔴 Only `email`, `password`, `firstName`, `lastName` and the branch field are
 * required. **`roleId`, `phone` and `pin` are optional**, despite all three
 * appearing in the documented example.
 */
export type ClientRequest =
  | {
      position: 'clientAdmin'
      email: string
      password: string
      firstName: string
      lastName: string
      phone?: string
      pin?: string
      roleId?: string
      clientDetails: ClientDetails
    }
  | {
      position: 'clientUser'
      email: string
      password: string
      firstName: string
      lastName: string
      phone?: string
      pin?: string
      roleId?: string
      /** The organisation to join — a `clientAdmin` must already have made it. */
      clientId: string
    }

/**
 * `PUT /clients/:id` accepts **any subset** — `At least one field is required`
 * is the only rule, so it is a true patch unlike most updates in this API.
 *
 * ⚠️ **`position` alone does not satisfy that rule**: it is the discriminator,
 * not a field, so it must accompany a real change.
 *
 * Shared rules with create: `password` **>= 8 characters**, `pin` **4-8
 * digits**, `email` must be a valid address.
 */
export type ClientUpdateRequest = Partial<{
  email: string
  password: string
  pin: string
  firstName: string
  lastName: string
  phone: string
  roleId: string
  clientId: string
  position: ClientPosition
}>

/* ------------------------------------------------------------------ */
/* Company accounts                                                    */
/* ------------------------------------------------------------------ */

/**
 * A company bank account — its reference code and a readable name.
 *
 * ⚠️ **Ids are CUIDs, not UUIDs.** The API rejects a UUID outright with
 * `Company account id must be a valid CUID` — a `400`, not a `404` — so a
 * malformed id never reaches the record lookup. Cargo ids share this format.
 */
export interface CompanyAccount {
  id: string
  code: string
  name: string
  status?: UnitStatus
  createdAt?: string
  updatedAt?: string
}

/**
 * Sent as JSON. **Both fields are required and must be non-empty strings** —
 * confirmed by the API rejecting each in turn, an empty string with
 * `Too small: expected string to have >=1 characters`, and a numeric `code`
 * with `expected string, received number`.
 */
export interface CompanyAccountRequest {
  code: string
  name: string
}

/* ------------------------------------------------------------------ */
/* Stockout authorizers                                                */
/* ------------------------------------------------------------------ */

/**
 * What an authorizer signs off.
 *
 * ⚠️ **`LOADING_ORDER` is the only accepted value**, exactly as spelled — the
 * API rejects `loading_order`, `STOCK_OUT` and anything else with
 * `Invalid input: expected "LOADING_ORDER"`. It is a one-value enum today, kept
 * as a list so a second type costs one line.
 */
export const AUTHORIZER_TYPES = ['LOADING_ORDER'] as const
export type AuthorizerType = (typeof AUTHORIZER_TYPES)[number]

/**
 * Who may authorise a stockout, and at which approval level.
 *
 * A role — not a user — holds the authority, so anyone in that role can sign
 * off. `levels` orders the chain: level 1 signs first.
 */
export interface Authorizer {
  id: string
  type: AuthorizerType
  levels: number
  roleId?: string
  /** Nested on the list; a bare `roleId` on the detail. */
  role?: { id: string; name: string; isActive?: boolean }
  status?: UnitStatus
  createdAt?: string
  updatedAt?: string
}

/**
 * Sent as JSON.
 *
 * ⚠️ **Only `roleId` is strictly required** — a body of just `{ roleId }` is
 * accepted, so `type` and `levels` have server defaults. Both are sent anyway:
 * relying on a default the API has not documented would break silently if it
 * changed.
 *
 * `levels` must be **> 0**. `roleId` must be a real role — an unknown UUID
 * gives `404 Role not found`, not a validation error.
 */
export interface AuthorizerRequest {
  type: AuthorizerType
  levels: number
  roleId: string
}

/* ------------------------------------------------------------------ */
/* Clearance agents                                                    */
/* ------------------------------------------------------------------ */

/**
 * A customs clearing agent and the fee it charges.
 *
 * ⚠️ **`fees` is returned as a string** (`"2000"`) though it is **sent as a
 * number**. The API accepts a numeric string on the way in and coerces it, but
 * a bare `NaN` is rejected — so the form parses before sending and every reader
 * parses on the way out.
 *
 * ⚠️ The route is `/clearing-agents` (**-ing**), while the module and its
 * permissions are `clearance.agent`. Both spellings are live; neither is a typo
 * to be corrected on one side only.
 */
export interface ClearanceAgent {
  id: string
  /** Plural in the API, but it holds one agent's name. */
  names: string
  fees: string | number
  status: UnitStatus
  createdAt?: string
}

/**
 * Sent as JSON. **Both fields are required** — confirmed by the API rejecting
 * each in turn.
 *
 * `fees` must be a **number ≥ 0** (`0` is accepted; negative is rejected with
 * `Too small: expected number to be >=0`), and `names` must be non-empty.
 */
export interface ClearanceAgentRequest {
  names: string
  fees: number
}

/* ------------------------------------------------------------------ */
/* Orders — plans                                                      */
/* ------------------------------------------------------------------ */

/**
 * Unlike every other status in this API, an order plan has **four** states, so
 * it is chosen explicitly rather than toggled.
 */
export const ORDER_PLAN_STATUSES = ['active', 'closed', 'terminated', 'force_closed'] as const
export type OrderPlanStatus = (typeof ORDER_PLAN_STATUSES)[number]

/**
 * A row of `GET /orders/order-plan`, which includes the plan's dates.
 *
 * ⚠️ `GET /orders/order-plan/:id` returns only `{ id, name, status }` — the
 * dates are **absent from the detail endpoint**, so they are optional here.
 * The UI opens the edit form from a table row, which has them.
 */
export interface OrderPlan {
  id: string
  name: string
  status: OrderPlanStatus
  /** ISO 8601. Present in the list, absent from the detail endpoint. */
  startDate?: string
  endDate?: string
}

export interface OrderPlanRequest {
  name: string
  /** ISO 8601, e.g. `2026-09-10T13:01:58.777Z`. */
  startDate: string
  endDate: string
}

/* ------------------------------------------------------------------ */
/* Stock                                                               */
/* ------------------------------------------------------------------ */

export const STOCK_STATUSES = ['awaiting', 'received', 'returned', 'cancelled'] as const
export type StockStatus = (typeof STOCK_STATUSES)[number]

/**
 * Stock held at a deport against a cargo shipment.
 *
 * **Read-only in this console.** Stock is created by the cargo flow, not here;
 * the only write is the status change.
 *
 * Shape **confirmed** against real records: the list nests `cargo` and `deport`
 * and carries **no `cargoId`/`deportId` at all**, so the flat ids stay optional
 * and the nested objects are the reliable path.
 */
/**
 * One nomination drawing on a stock line, as `/stock` nests it.
 *
 * ⚠️ **`driver` and `vehicle` are flat here.** The `/nominations` endpoint
 * nests the same pair as a single `driverVehicle` object, so the two shapes
 * disagree and cannot share a type.
 */
export interface StockNomination {
  id: string
  quantity: number
  destination: string
  expectedLoadingDate?: string
  driver?: {
    id: string
    names: string
    phone?: string
    /** ⚠️ Spelled `lisence`. */
    lisence?: string
    passport?: string
  }
  vehicle?: {
    id: string
    platNumber: string
    truckNumber?: string
    trailerNumber?: string
    model?: string
  }
}

export interface Stock {
  id: string
  /** Absent from the list — the nested `depot` is what is actually returned. */
  deportId?: string
  /** Likewise absent; use `cargo`. */
  cargoId?: string
  /**
   * What was received, **before** any nomination draws against it.
   *
   * ⚠️ This replaced a plain `quantity` field, which no longer exists. All three
   * are **numbers**, unlike the strings the cargo endpoint returns.
   */
  quantityBeforeNominations: number
  /** How much of this stock is already allocated to nominations. */
  nominatedQuantity: number
  /**
   * What is still available: `quantityBeforeNominations - nominatedQuantity`.
   * This is the figure a new nomination must fit inside.
   */
  remainingQuantity: number
  /**
   * Nominations drawing on this stock.
   *
   * Was empty on every record while this was first written, so it had been
   * typed `unknown[]`. It is populated now, and its quantities **reconcile**:
   * the sum equals `nominatedQuantity`, and
   * `quantityBeforeNominations - nominatedQuantity = remainingQuantity`.
   *
   * ⚠️ Note `driver` and `vehicle` are **flat here** — the `/nominations`
   * endpoint nests the pair as `driverVehicle` instead.
   */
  nominations?: StockNomination[]
  receivedDate: string
  status: StockStatus
  /**
   * ⚠️ Spelled **`depot`** on a stock row, unlike `Deport` and its endpoint,
   * which use "deport" throughout this API.
   */
  depot?: Deport
  /**
   * ✅ Confirmed: this nested copy **did** follow cargo's rename — it carries
   * `ambQuantity` and `quantityAt20C`, and no `quantity`. It was typed loosely
   * while stock was empty; the live response has since settled it.
   *
   * Only a subset of the cargo record is nested here.
   */
  cargo?: Pick<
    Cargo,
    | 'id'
    | 'blRef'
    | 'vesselName'
    | 'ambQuantity'
    | 'quantityAt20C'
    | 'receivedDate'
    | 'expirationDate'
    | 'status'
  >
  /**
   * The item this stock holds.
   *
   * ⚠️ **Not returned on a stock row** — it lives on the enclosing `StockGroup`.
   * `useStockList` copies it down when flattening, so a flat row still has it.
   */
  item?: StockItem
  createdAt?: string
  updatedAt?: string
}

/**
 * The item shape stock nests.
 *
 * Carries a **fully resolved `baseUnit`**, so the unit needs no lookup. It has
 * no `parentId`, so the parent cannot be named from here.
 */
export interface StockItem {
  id: string
  name: string
  descriptions: string | null
  status: UnitStatus
  baseUnit?: {
    id: string
    name: string
    code: string
  }
  /**
   * The item's tolerance rates, nested by `GET /central-stock`.
   *
   * An array though an item has at most one — and it agrees with what
   * `/item-tolerance-rates` returns for the same item, verified live. Only
   * `active` entries count.
   */
  toleranceRates?: ItemToleranceRate[]
}

/** Totals the API computes for one item's stock. */
export interface StockSummary {
  /**
   * The sum of **every** nested quantity, whatever its status. Use
   * `quantitiesByStatus` to separate what is actually held.
   */
  totalQuantity: number
  /** How much of this item's stock is already allocated to nominations. */
  nominatedQuantity: number
  /**
   * `totalQuantity - nominatedQuantity` — what is left to nominate against.
   * Confirmed to equal the sum of each stock's own `remainingQuantity`.
   */
  remainingQuantity: number
  /** How many stock rows the group holds. */
  stockCount: number
  /**
   * Quantity per status, e.g. `{ received: 400 }`. **Only statuses actually
   * present appear** — a group with no cancelled stock has no `cancelled` key,
   * so read it with a default rather than assuming all four exist.
   */
  quantitiesByStatus: Partial<Record<StockStatus, number>>
}

/**
 * `GET /stock` returns **one entry per item**, not a flat list of stock rows —
 * each item carries its own `stocks` array and a computed `summary`.
 */
export interface StockGroup {
  item: StockItem
  summary: StockSummary
  stocks: Stock[]
}

/**
 * Query parameters for `GET /stock`. All optional, and all **validated when
 * present** — so an unset filter must be **omitted entirely**: `status=` and
 * `deportId=` both return `400`, not "no filter".
 *
 * ⚠️ The parameter is **`deportId`**, matching the rest of the API, even though
 * the response nests the depot as `depot`. `depotId` is silently ignored rather
 * than rejected, so a typo there returns unfiltered results that look correct.
 *
 * 🔴 **`startDate` is effectively required.** Omit it and the list returns an
 * empty array no matter how much stock exists — verified repeatedly, and
 * `endDate` alone does not help. The same defect affects `NominationFilter` and
 * `StockoutOrderFilter`. `stockService.list` supplies a far-past floor when a
 * caller omits one, so callers that want all stock get all stock.
 */
export interface StockFilter {
  /**
   * ISO 8601 instant. Filters on `receivedDate`. See the note above — leaving
   * this unset returns nothing, so the service fills it in rather than passing
   * the omission through.
   */
  startDate?: string
  endDate?: string
  status?: StockStatus
  deportId?: string
}

/* ------------------------------------------------------------------ */
/* Nominations                                                         */
/* ------------------------------------------------------------------ */

/**
 * A nomination: stock allocated to a driver's vehicle for delivery.
 *
 * ⚠️ **The list and detail endpoints return disjoint shapes** — more so than
 * anywhere else in this API:
 *
 * - **List** nests `driverVehicle` (with the driver and vehicle inside) but
 *   carries **no ids, no date, and no timestamps**.
 * - **Detail** returns the flat `stockId`/`driverVehicleId` and the date, but
 *   **no nested relations at all**.
 *
 * Neither is a superset of the other, so the list is what the table renders and
 * the detail is what the edit form binds to.
 *
 * ⚠️ **The date field is spelled differently on write and read**: sent as
 * `expectedLoadingedDate` (note the extra `ed`), returned as
 * `expectedLoadingDate`. This mirrors the `paassport`/`passport` split on
 * drivers. See `NominationRequest`.
 */
/**
 * The quantity of a nomination, whichever field the response carries.
 *
 * The request renamed `quantity` to `quantityAt20C`, but the response was
 * unverifiable (the list was empty), and `/stock` still nests nominations with
 * a plain `quantity`. Reading through here means a caller works either way.
 */
export function nominationQuantity(
  nomination: Pick<Nomination, 'quantity' | 'quantityAt20C'> | undefined,
): number {
  return Number(nomination?.quantityAt20C ?? nomination?.quantity)
}

export interface Nomination {
  id: string
  /** Detail only — the list omits it. */
  stockId?: string
  /** Detail only. This is the **assignment** id, not a vehicle id. */
  driverVehicleId?: string
  /**
   * ✅ Confirmed on **both** the list and the detail: `quantity` is gone, and
   * these two replaced it. Typed as optional-but-present while the list was
   * empty; the live response has since settled it.
   *
   * Both are returned as **strings**. `quantityAt20C` is the figure the stock
   * ceiling applies to, and the one the PFI form multiplies by the currency's
   * rate to get the amount.
   *
   * ⚠️ `quantity` is retained **only** because `/stock` still nests its
   * nominations with that older field — see `StockNomination`. Read through
   * `nominationQuantity()` so either shape works.
   */
  quantityAt20C: string
  ambQuantity?: string
  /** @deprecated Gone from `/nominations`; `/stock` still nests it. */
  quantity?: string
  destination: string
  /** Detail only, and **without** the `ed` the request field carries. */
  expectedLoadingDate?: string
  /**
   * List only — the driver and vehicle nested together.
   *
   * ⚠️ The vehicle carries **`tankCapacity`** here, unlike the copy nested
   * under `/drivers`, which omits it.
   */
  driverVehicle?: {
    driver: {
      names: string
      phone?: string
      passport?: string
      lisence?: string
    }
    vechile: {
      id: string
      platNumber: string
      model?: string
      tankCapacity?: string
      trailerNumber?: string
      truckNumber?: string
    }
  }
  /**
   * The stock this nomination draws from.
   *
   * The `/nominations` list now nests it with **both** the `cargo` and the
   * `item`; when a nomination is nested inside a T1 validation only the `item`
   * is present, so `cargo` stays optional.
   *
   * ⚠️ **No `id`** — the nesting identifies the stock's contents but not the
   * stock itself, so the edit form still reads `stockId` from the detail
   * endpoint.
   *
   * ⚠️ The item here carries a bare **`baseUnitId`**, unlike the `/stock`
   * endpoint's resolved `baseUnit`, so naming the unit needs the units list.
   */
  stock?: {
    cargo?: Cargo
    item?: {
      id: string
      name: string
      descriptions: string | null
      parentId: string | null
      baseUnitId: string
      status: UnitStatus
    }
  }
  /**
   * Present on the T1 nesting, and **populated** — three entries in live data,
   * where this was previously always empty.
   *
   * ⚠️ Deliberately left `unknown[]`: this is a **rawer shape** than
   * {@link NominationTimelineEntry}, which `GET /nominations/time-line/:id`
   * returns. It carries a raw `timeLineStatusId` foreign key instead of a
   * resolved `status`/`level` pair, a `changedBy` instead of `createdBy`, and
   * `descriptions` as `null` rather than a string array — and the entries are
   * not ordered. Rendering a stage ladder from it would need a lookup from
   * `timeLineStatusId` to a stage, which no endpoint exposes, so the timeline
   * endpoint remains the only usable source.
   */
  timeLine?: unknown[]
  createdAt?: string
  updatedAt?: string
}

/**
 * Query parameters for `GET /nominations`. All optional, and all validated when
 * present — so an unset filter must be **omitted entirely**.
 *
 * `itemId` returned `500 INTERNAL_ERROR` during development and shipped
 * disabled for a while. **Fixed server-side and re-verified** — it now filters
 * correctly, and the control is live.
 *
 * 🔴 **`startDate` is effectively required.** Omit it and the list returns an
 * empty array no matter how many nominations exist — verified repeatedly, and
 * `endDate` alone does not help. The same defect affects `StockoutOrderFilter`.
 * `nominationsService.list` supplies a far-past floor when a caller omits one,
 * so callers that want every nomination get every nomination.
 */
export interface NominationFilter {
  /**
   * ISO 8601 instant. See the note above — leaving this unset returns nothing,
   * so the service fills it in rather than passing the omission through.
   */
  startDate?: string
  endDate?: string
  itemId?: string
}

/**
 * The lifecycle a nomination moves through, in order. The API assigns each
 * stage a fixed `level`, so the ladder is a constant rather than something to
 * infer from whatever a given timeline happens to contain.
 *
 * Verified identical across two nominations: `awaiting` is always level 1,
 * `stockReceived` always level 5.
 */
export const NOMINATION_STAGES = [
  { level: 1, status: 'awaiting', label: 'Awaiting' },
  { level: 2, status: 'underLoading', label: 'Under loading' },
  { level: 3, status: 't1Pending', label: 'T1 pending' },
  { level: 4, status: 't1Confirmed', label: 'T1 confirmed' },
  { level: 5, status: 'stockReceived', label: 'Stock received' },
] as const

export type NominationStageStatus = (typeof NOMINATION_STAGES)[number]['status']

/**
 * One stage a nomination has **already reached**, from
 * `GET /nominations/time-line/:id`. Stages not yet reached are simply absent,
 * so the response length is the progress.
 *
 * ⚠️ **`id` is not unique across nominations.** It encodes the *level*, not the
 * entry — every nomination's level 1 is `550e8400-e29b-41d4-a716-446655440000`,
 * level 2 is `…0001`, and so on. Verified against two separate nominations.
 * Key rows by `level`, never by `id`.
 *
 * ⚠️ **An unknown id returns `{success: true, data: []}`**, not a `404`. "No
 * such nomination" and "not started yet" are indistinguishable, so an empty
 * array must never be rendered as an error.
 */
export interface NominationTimelineEntry {
  id: string
  status: NominationStageStatus
  /** 1-5, matching `NOMINATION_STAGES`. */
  level: number
  /** One or more notes; level 4 returns four. Rendered as a list. */
  descriptions: string[]
  createdAt: string
  /** Null on stages the system advanced itself — level 4 was, in live data. */
  createdBy: string | null
}

/**
 * Sent as JSON. All five fields are **required** — confirmed from the API's own
 * rejection of a body containing none of them.
 *
 * ⚠️ `expectedLoadingedDate` is the request spelling; the response uses
 * `expectedLoadingDate`. Verified by sending the un-`ed` spelling, which the API
 * still reported as missing.
 */
export interface NominationRequest {
  stockId: string
  /** The **assignment** id from `drivers[].vehicles[].id` — not `vechile.id`. */
  driverVehicleId: string
  destination: string
  /**
   * ⚠️ **Two quantities now** — `quantity` is gone from this endpoint, the same
   * rename cargo received.
   *
   * `quantityAt20C` is **required** and must be a **number**; a non-numeric
   * string is rejected with `expected number, received NaN`.
   *
   * ⚠️ **`ambQuantity` is optional** — it is absent from the API's own list of
   * missing fields — and accepts either a number or a numeric string. It is
   * sent as a number for consistency with the rest of the API.
   */
  quantityAt20C: number
  ambQuantity?: number
  /** ISO 8601 instant. Note the spelling. */
  expectedLoadingedDate: string
}

/* ------------------------------------------------------------------ */
/* PSS — sites                                                         */
/* ------------------------------------------------------------------ */

/**
 * A PSS site (station). Lives under the `PSS` module, which the backend nests
 * as `PSS_OPERATION_FORECOURT_SERVICE_BAY_SHOP_CAR_WASH > PSS_OPERATION_FORECOURT > PSS`.
 *
 * Only `name` is required; the contact fields are all optional and come back
 * `null` when unset.
 */
export interface Site {
  id: string
  name: string
  phone: string | null
  email: string | null
  address: string | null
  status: UnitStatus
  /**
   * List only — the detail endpoint omits it. Pumps are a **separate module**
   * (`PUMP`) with their own permissions, so they are typed but not surfaced by
   * the sites page.
   */
  pumps?: Array<{
    id: string
    name: string
    status: UnitStatus
  }>
  createdAt?: string
  updatedAt?: string
}

/**
 * Sent as JSON. **Only `name` is required** — `phone`, `email` and `address`
 * are optional, despite typically being sent together.
 *
 * `email` **is** format-validated by the API (`Invalid email address`), so the
 * form validates it too rather than waiting for the round trip.
 */
export interface SiteRequest {
  name: string
  phone?: string
  email?: string
  address?: string
}

/**
 * A pump belonging to a site.
 *
 * ⚠️ The list and detail shapes are **disjoint**, as with nominations and PFI:
 * the **list nests `site` but omits `status` and `siteId`**, while the
 * **detail returns `siteId` and `status` but no nested site**. So the table
 * cannot show a status from the list, and the edit form must read the detail.
 */
export interface Pump {
  id: string
  name: string
  /** Detail only — the list nests the whole `site` instead. */
  siteId?: string
  /** Detail only. */
  status?: UnitStatus
  /** List only. */
  site?: Site
  createdAt?: string
  updatedAt?: string
}

/** Sent as JSON. Both fields are **required**. */
export interface PumpRequest {
  name: string
  siteId: string
}

/**
 * A display attached to a pump — the third level of PSS: site → pump → display.
 *
 * Unlike `Pump`, the **list carries `status`** as well as nesting the pump, so
 * the table needs no second source for it. The detail still returns the flat
 * `pumpId` the edit form binds to, which the list omits.
 */
export interface Display {
  id: string
  name: string
  /** A device code, e.g. `DSCOSDE222`. */
  code: string
  /** Detail only — the list nests the whole `pump` instead. */
  pumpId?: string
  /** Present on **both** the list and the detail. */
  status: UnitStatus
  /** List only. */
  pump?: Pump
  createdAt?: string
  updatedAt?: string
}

/** Sent as JSON. All three fields are **required**. */
export interface DisplayRequest {
  name: string
  code: string
  pumpId: string
}

/**
 * A cuve — a storage tank at a site, holding one item between a minimum and a
 * maximum level.
 *
 * The **list nests `item` and `site`**; the **detail returns the flat
 * `itemId`/`siteId`** instead. Both carry `status` and the three levels.
 */
export interface Cuve {
  id: string
  name: string
  /** Detail only — the list nests the whole `item`. */
  itemId?: string
  /** Detail only — the list nests the whole `site`. */
  siteId?: string
  /** Returned as strings, as quantities are throughout this API. */
  minimum: string
  maximum: string
  /** The unusable residue at the bottom of the tank. */
  deadStock: string
  status: UnitStatus
  /** List only. */
  item?: ItemDetail
  /** List only. */
  site?: Site
  createdAt?: string
  updatedAt?: string
}

/**
 * Sent as JSON. **All six fields are required**, `deadStock` included — despite
 * being commonly sent empty.
 *
 * The three levels are **coerced**: a number and a numeric string are both
 * accepted, a non-numeric string is not. `""` and `null` are accepted too and
 * stored as `0`, which is why the form treats `deadStock` as optional and sends
 * `0` when blank rather than relying on that coercion.
 */
export interface CuveRequest {
  name: string
  itemId: string
  siteId: string
  minimum: number
  maximum: number
  deadStock: number
}

/**
 * A nozzle — the join point of the PSS chain, tying a **pump**, a **display**
 * and a **cuve** together.
 *
 * The **list nests all three**; the **detail returns their flat ids** instead.
 * Both carry `status` and `nozzleCode`.
 */
export interface Nozzle {
  id: string
  name: string
  /** A device code, e.g. `NZ057383`. */
  nozzleCode: string
  /** Detail only — the list nests the whole `pump`. */
  pumpId?: string
  /** Detail only. */
  displayId?: string
  /** Detail only. */
  cuveId?: string
  status: UnitStatus
  /** List only. */
  pump?: Pump
  /** List only. */
  display?: Display
  /** List only. */
  cuve?: Cuve
  createdAt?: string
  updatedAt?: string
}

/**
 * Sent as JSON. All five fields are **required**.
 *
 * Whether the API checks that the pump, display and cuve belong to the **same
 * site** is unverified — confirming it would need a successful write. The form
 * prevents the question arising by filtering the display and cuve pickers to the
 * chosen pump's site.
 */
export interface NozzleRequest {
  name: string
  nozzleCode: string
  pumpId: string
  displayId: string
  cuveId: string
}

/* ------------------------------------------------------------------ */
/* Stockout orders                                                     */
/* ------------------------------------------------------------------ */

/**
 * An order to take stock out — sold from a site at an agreed unit price.
 *
 * ⚠️ The list is empty and the API was unavailable when this was built, so the
 * **response shape is unconfirmed**. These fields mirror the create payload plus
 * the conventions every other resource here follows: nested relations on the
 * list, quantities that may arrive as strings.
 */
/**
 * How the stock is going out.
 *
 * ⚠️ **`internal | b2b`** — confirmed by the API's own rejection listing exactly
 * those two. `external` is *not* a value.
 */
export const STOCKOUT_ORDER_TYPES = ['internal', 'b2b'] as const
export type StockoutOrderType = (typeof STOCKOUT_ORDER_TYPES)[number]

export interface StockoutOrder {
  id: string
  /** May arrive as a string, as quantities do elsewhere in this API. */
  quantity: number | string
  unitPrice: number | string
  totalPrice?: number | string
  orderType?: StockoutOrderType
  status?: string
  /** Set once approved; `null` while pending. */
  approvedAt?: string | null
  /** Where it is going. Absent on a `b2b` order, which needs no site. */
  site?: Site | null
  /** Who raised it. */
  user?: { id: string; firstName: string; lastName: string; email?: string } | null
  /** Who approved it, once someone has. */
  approvedUser?: { id: string; firstName: string; lastName: string; email?: string } | null
  /** The customs clearance the stock was drawn from. */
  clearance?: Pick<
    CentralStockClearance,
    'id' | 'quantity' | 'status' | 'fees' | 'amount' | 'supportingDocUrl' | 'dmsDocUrl' | 'createdAt'
  > & { agent?: ClearanceAgent | null }
  /**
   * The central stock it came out of — **the only place the item appears**.
   * There is no top-level `item` or `itemId` on a row any more.
   */
  centralStock?: {
    id: string
    quantity: number | string
    status?: string
    createdAt?: string
    item?: StockItem
    /** ⚠️ Spelled `deport` here, unlike central stock's own `depot`. */
    deport?: Deport
    t1Validation?: { id: string; exportingCountry: string }
  } | null
  createdAt?: string
  updatedAt?: string
}

/** One row of a breakdown — the same shape for items and sites. */
export interface StockoutBreakdownRow {
  orderCount: number
  quantity: number
  amount: number
}

/* ------------------------------------------------------------------ */
/* Loading orders                                                      */
/* ------------------------------------------------------------------ */

/** One stockout order assigned to a vehicle, with the quantity it carries. */
export interface LoadingOrderLine {
  orderId: string
  /** ⚠️ A **number**, not a string. Must be **> 0**. */
  quantity: number
}

/**
 * Sent as JSON to `POST /stock-out-orders/loading-orders`.
 *
 * Assigns one or more stockout orders to a driver's vehicle for loading.
 *
 * 🔴 **Two independent ceilings**, both enforced server-side with `422`:
 *
 * | limit | message |
 * | --- | --- |
 * | per **order** | `Order <id> has 40 unassigned but 100 was requested` |
 * | per **vehicle** | `Vehicle capacity is 5000; 0 is already assigned and 8000 was requested` |
 *
 * The vehicle ceiling is **cumulative**: it sums the whole `orders` array *and*
 * whatever is already assigned to that vehicle, so two lines each within
 * capacity can still be refused together.
 *
 * ⚠️ **The same order cannot appear twice** in one request — the API answers
 * `The request contains invalid data`.
 *
 * ⚠️ `driverVehicleId` is the **assignment** id (`driver.vehicles[].id`), not
 * the vehicle's own id — the same field nominations uses.
 */
export interface LoadingOrderRequest {
  driverVehicleId: string
  /** At least one line — an empty array is rejected. */
  orders: LoadingOrderLine[]
}

/** One order on a loading order, with the quantity being loaded from it. */
export interface LoadedOrder {
  id: string
  orderId: string
  loadingOrderId?: string
  /** ⚠️ A **string**. What this loading order takes from the order. */
  quantity: string | number
  /** The stockout order itself, with its stock and site nested. */
  order?: StockoutOrder | null
  createdAt?: string
}

/**
 * A loading order seen from the receiving end.
 *
 * `GET /stock-out-orders/reception-orders` returns the same loading orders as
 * `/loading-orders`, with the reception figures added and the vehicle block
 * trimmed. One row per loading order, carrying every site's share in
 * `loadedOrders[]`.
 */
export interface ReceptionOrder extends LoadingOrder {
  /** `pending` until every share has been received into a cuve. */
  receptionStatus?: string
  /** How much of `totalQuantity` has been received so far. */
  receivedQuantity?: string | number
  /** What is still to receive — `totalQuantity - receivedQuantity`. */
  remainingQuantity?: string | number
  /** One entry per receipt into a cuve. Empty until the first is recorded. */
  orderReceptions?: {
    id: string
    loadedOrderId?: string
    cuveId?: string
    receivedQty?: string | number
    createdAt?: string
  }[]
}

/**
 * Receives one loading order's fuel into a cuve.
 *
 * Sent as **JSON** to
 * `POST /stock-out-orders/reception-orders/{loadingOrderId}/receive`.
 *
 * ⚠️ **`POST` only** — `PUT` and `PATCH` are both `ROUTE_NOT_FOUND`.
 *
 * 🔒 **The API restricts this to site managers**, and says so plainly:
 * `403 FORBIDDEN — "Only site managers can receive loading orders into a cuve"`.
 * That is a real server-side rule, not a UI convention, so the button is shown
 * only to a `siteManager` and the refusal is surfaced verbatim if it fires
 * anyway.
 *
 * ⚠️ `receivedQty` must be a **number greater than zero** — `0` and negatives
 * are both rejected with `Too small: expected number to be >0`, despite the
 * documented body showing strings.
 */
export interface ReceptionRequest {
  /** The cuve the fuel goes into. Validated as a UUID. */
  cuveId: string
  receivedQty: number
}

/**
 * A loading order, as returned by the list.
 *
 * ⚠️ **Grouped: one row per request**, carrying `loadedOrders[]`. An earlier
 * shape returned one row *per order* with a top-level `orderId` and `quantity`;
 * both are gone.
 *
 * ⚠️ **`totalQuantity` replaces the old `quantity`** — the sum across
 * `loadedOrders`, verified live (15 + 20 = 35).
 *
 * ⚠️ The driver/vehicle block is spelled **`dVehicle`**, and the vehicle inside
 * it **`vechile`** — two different misspellings in one path.
 */
export interface LoadingOrder {
  id: string
  driverVehicleId: string
  /** ⚠️ A **string**. The sum of every line's quantity. */
  totalQuantity: string | number
  /** How many authorisers the chain requires — see `Authorizer`. */
  authoriserCount?: number
  status?: string
  /** Tracked separately from `status`: `pending` until the chain signs off. */
  authorizationStatus?: string
  /** Empty until someone signs. */
  authorizers?: {
    id: string
    level?: number
    status?: string
    user?: { id: string; firstName: string; lastName: string } | null
    createdAt?: string
  }[]
  /** The orders on this load. */
  loadedOrders?: LoadedOrder[]
  /** ⚠️ `dVehicle`, not `driverVehicle`. */
  dVehicle?: {
    id: string
    driverId?: string
    vehicleId?: string
    /** `occupied` once a load is assigned. */
    status?: string
    driver?: { id: string; names: string; phone?: string }
    /**
     * ⚠️ `vechile`, as everywhere else. It **does** carry `tankCapacity` here,
     * unlike the copy nested under `/drivers`.
     */
    vechile?: {
      id: string
      platNumber: string
      tankCapacity?: string | number
      truckNumber?: string
      trailerNumber?: string
      model?: string
      status?: UnitStatus
    }
  } | null
  createdAt?: string
  updatedAt?: string
}

/**
 * `GET /stock-out-orders` returns an **envelope**, not an array — totals and
 * breakdowns the API computes, alongside the orders themselves.
 */
export interface StockoutOrdersResponse {
  summary: {
    orderCount: number
    totalQuantity: number
    totalAmount: number
    averageUnitPrice: number
    quantitiesByStatus: Record<string, number>
    amountsByStatus: Record<string, number>
    quantitiesByOrderType: Record<string, number>
    amountsByOrderType: Record<string, number>
  }
  breakdowns: {
    items: (StockoutBreakdownRow & { item: StockItem })[]
    sites: (StockoutBreakdownRow & { site: Site })[]
  }
  orders: StockoutOrder[]
}

/**
 * Sent as JSON.
 *
 * 🔴 **The two order types draw on different pools**, each with its own `422`
 * ceiling:
 *
 * | `orderType` | drawn from | message |
 * | --- | --- | --- |
 * | `internal` | **cleared** stock | `Only <n> cleared stock is available` |
 * | `b2b` | **uncleared** stock | `Only <n> uncleared stock is available` |
 *
 * Which fits the business: a B2B sale passes stock on before it is cleared,
 * while moving it to one of our own sites requires clearance first.
 *
 * ⚠️ **`siteId` is required only when `orderType` is `internal`**:
 * `siteId is required when orderType is internal`. A `b2b` order needs none.
 *
 * `quantity` must be **> 0**; `unitPrice` must be **>= 0**.
 */
export interface StockoutOrderRequest {
  itemId: string
  /** Must be a **number**. */
  quantity: number
  /** Must be a **number**. */
  unitPrice: number
  orderType: StockoutOrderType
  /** Required for `internal`, omitted for `b2b`. */
  siteId?: string
}

/**
 * The four states a stockout order moves through.
 *
 * Confirmed from the API's own rejection: `Invalid option: expected one of
 * "pending"|"approved"|"rejected"|"cancelled"`. Lowercase — `APPROVED` is
 * rejected.
 */
export const STOCKOUT_ORDER_STATUSES = ['pending', 'approved', 'rejected', 'cancelled'] as const
export type StockoutOrderStatus = (typeof STOCKOUT_ORDER_STATUSES)[number]

/**
 * Query parameters for `GET /stock-out-orders`.
 *
 * Both optional and validated when present, so an unset one must be **omitted
 * entirely** — `startDate=` returns `400`.
 *
 * 🔴 **The endpoint returns nothing unless `startDate` is set.** With two orders
 * created `2026-08-26`:
 *
 * | request | orders | expected |
 * | --- | --- | --- |
 * | no filter | **0** | 2 |
 * | `endDate` alone, any value | **0** | 2 |
 * | `startDate` alone | 2 | 2 |
 * | both | 2 | 2 |
 *
 * A **complete range is correct at every boundary** — a range ending the day
 * before creation gives 0, one ending on or after it gives 2 — so the filter
 * itself works. What fails is the *absence* of `startDate`: the default behaves
 * as though one were set in the future.
 *
 * The page therefore opens on a **default range** rather than unfiltered, which
 * is the only way to show the orders that exist.
 */
export interface StockoutOrderFilter {
  /** ISO 8601 instant. */
  startDate?: string
  endDate?: string
}

/* ------------------------------------------------------------------ */
/* Central stock                                                       */
/* ------------------------------------------------------------------ */

/**
 * Stock held centrally, received against a T1 validation.
 *
 * ⚠️ **Only two routes exist**: `GET /central-stock` and `POST /central-stock`.
 * There is no detail, update, delete or status endpoint — `GET
 * /central-stock/:id` returns `404`, so this list is the only read.
 */
/**
 * One movement against a receipt.
 *
 * ⚠️ **These hang off the stock row, not off a clearance** — they were nested
 * inside `clearances[]` in an earlier shape.
 *
 * Types seen live: `received`, `reconcilliationIn`, `reconcilliationOut` (note
 * the doubled `l`, matching `RECONCILIATION_TYPES`). `type` stays a `string`
 * because a clearance or stockout may add more.
 */
export interface CentralStockTransaction {
  id: string
  quantity: number
  type: string
  createdAt?: string
  updatedAt?: string
  createdBy?: {
    id: string
    firstName: string
    lastName: string
  }
}

/**
 * A customs clearance against one central stock record.
 *
 * `fees`, `amount`, `agent`, `clearedBy` and both document URLs are **null
 * until the clearance is actually processed**, so every one is optional here.
 */
export interface CentralStockClearance {
  id: string
  quantity: number
  fees: number | null
  amount: number | null
  /** `cleared` and `uncleared` both seen. */
  status: string
  supportingDocUrl: string | null
  dmsDocUrl: string | null
  /**
   * ⚠️ The agent is the **`ClearanceAgent`** shape — `names` (plural) with its
   * own `fees` and `status`, not a bare `{ id, name }`.
   */
  agent: Pick<ClearanceAgent, 'id' | 'names' | 'fees' | 'status'> | null
  clearedBy: { id: string; firstName: string; lastName: string } | null
  createdAt?: string
  updatedAt?: string
}

/**
 * One central stock receipt.
 *
 * ⚠️ **`quantity` no longer exists**, replaced by four figures that track its
 * life: `quantityBeforeTransactions`, `receivedQuantity`, `reconciledQuantity`
 * and `soldOutQuantity`, with `remainingQuantity` as
 * `received - reconciled - soldOut` — confirmed against live data.
 */
export interface CentralStock {
  id: string
  /** What arrived, before anything drew against it. */
  quantityBeforeTransactions: number
  receivedQuantity: number
  /** @deprecated Split into the two directional figures below. */
  reconciledQuantity?: number
  reconciledInQuantity?: number
  reconciledOutQuantity?: number
  soldOutQuantity: number
  /** `received + reconciledIn - reconciledOut - soldOut`. */
  remainingQuantity: number
  /**
   * Clearance figures **per receipt** — previously only on the group summary.
   * A receipt can be partly cleared: 150 cleared of 260 leaves 110 uncleared.
   */
  clearedQuantity?: number
  unclearedQuantity?: number
  /** Absent when no document was attached. */
  supportingDocUrl?: string
  /** `inStock` seen so far. */
  status: string
  /** ⚠️ Spelled `depot`, as on stock — not `deport`. */
  depot?: Deport
  /** The T1 this was received against, with its nomination nested. */
  t1Validation?: {
    id: string
    exportingCountry: string
    supportingDocUrl?: string | null
    createdAt?: string
    nomination?: {
      id: string
      /**
       * ⚠️ Followed the `/nominations` rename — there is no plain `quantity`
       * here any more. `quantityAt20C` is what a receipt's loss is measured
       * against; read it through {@link nominationQuantity}.
       */
      ambQuantity?: string
      quantityAt20C?: string
      /** @deprecated Gone from the response; kept so older payloads still parse. */
      quantity?: string
      destination: string
      expectedLoadingDate?: string
    }
  }
  clearances?: CentralStockClearance[]
  /**
   * ⚠️ **Moved here from inside each clearance.** The receipt now carries one
   * ledger of every movement against it — `received`, `reconcilliationIn`,
   * `reconcilliationOut` — newest first.
   */
  transactions?: CentralStockTransaction[]
  createdAt?: string
  updatedAt?: string
}

/**
 * Totals the API computes for one item's central stock.
 *
 * ⚠️ **This shape changed when reconciliation and clearance shipped.**
 * `reconciledQuantity` split into `reconciledInQuantity` /
 * `reconciledOutQuantity`, and `clearedQuantity` / `unclearedQuantity` are new.
 * The old field is kept optional so a stale server response still parses.
 */
export interface CentralStockSummary {
  totalQuantity: number
  receivedQuantity: number
  /** @deprecated Split into the two directional figures below. */
  reconciledQuantity?: number
  reconciledInQuantity?: number
  reconciledOutQuantity?: number
  soldOutQuantity: number
  remainingQuantity: number
  /** How much has been customs-cleared. */
  clearedQuantity?: number
  /**
   * How much is still to clear — **the ceiling a new clearance is bounded by**.
   * The API refuses anything larger with `422` and the message
   * `Only <n> uncleared stock is available`.
   */
  unclearedQuantity?: number
  stockCount: number
  /** Quantity per stock status, e.g. `{ inStock: 50 }`. */
  quantitiesByStatus: Record<string, number>
  /**
   * Quantity per **clearance** status, e.g. `{ uncleared: 50 }`. A second,
   * independent dimension: stock can be in hand yet not customs-cleared.
   * Empty until at least one clearance exists.
   */
  clearanceQuantitiesByStatus: Record<string, number>
}

/**
 * How the stock being cleared is chosen.
 *
 * ⚠️ **`type` is newly required** — a clearance without it is rejected naming
 * both options. `fifo` lets the API pick the oldest uncleared receipts itself;
 * `manual` clears one named receipt and **requires `centralStockId`**, which the
 * API reports as a root-level error (`centralStockId is required for manual
 * clearance`) rather than against the field.
 */
export const CLEARANCE_TYPES = ['fifo', 'manual'] as const
export type ClearanceType = (typeof CLEARANCE_TYPES)[number]

/**
 * Sent as **`multipart/form-data`** — despite the documented body showing
 * document *URLs*, both document fields take **file uploads**, like cargo, T1
 * validation and the central-stock create.
 *
 * A **discriminated union on `type`**, like discounts and authorizers: `fifo`
 * takes no receipt id, `manual` requires one. Beyond `type`, only `itemId` and
 * `quantity` are required. Clearance is raised **per item**, not per receipt:
 * the API pools an item's uncleared stock and refuses anything above it with
 * `422` — `Only <n> uncleared stock is available`.
 *
 * ⚠️ `quantity` must be **> 0**; `fees` and `amount` must be **>= 0**.
 * `agentId` is optional but validated when present (`Clearing agent not found`).
 */
interface ClearanceRequestBase {
  itemId: string
  quantity: number
  fees?: number
  amount?: number
  /** A `ClearanceAgent` id. Optional. */
  agentId?: string
  /**
   * An uploaded file, not a URL string.
   *
   * The endpoint also accepts a `supportingDocUrl` upload, but the clearance
   * dialog no longer offers one — the DMS document is the only one recorded
   * here. Neither was ever required: the empty-body error names only `type`,
   * `itemId` and `quantity`.
   */
  dmsDoc?: File
}

export type ClearanceRequest =
  | (ClearanceRequestBase & {
      type: 'fifo'
      /** Not sent for `fifo` — the API chooses the receipts itself. */
      centralStockId?: never
    })
  | (ClearanceRequestBase & {
      type: 'manual'
      /** Required: the one receipt to clear. */
      centralStockId: string
    })

/**
 * `GET /central-stock` returns **one entry per item**, like `/stock` — each
 * carries its own `stocks` array and a computed `summary`.
 *
 * 🔴 **The five fields below are not group-level figures, despite sitting here.**
 * Verified live: on a group of two receipts, `id` equals `stocks[0].id` and
 * `quantityAt20C` is `995` — the newest receipt's own figure — while the group's
 * `summary.receivedQuantity` is `2000000995`. They are one receipt's columns
 * leaking onto the group, so **nothing may present them as a total**.
 *
 * The page renders them against the receipt they belong to instead, matched by
 * `id`. Once the API moves them onto `CentralStock` where they belong, that
 * lookup keeps working and this block can be deleted.
 */
export interface CentralStockGroup {
  item: StockItem
  summary: CentralStockSummary
  stocks: CentralStock[]
  /**
   * ⚠️ The **newest receipt's** id, not the group's — see above. Use it to find
   * which `stocks[]` entry the figures below describe.
   */
  id?: string
  /** ⚠️ That receipt's status, not a group state. */
  status?: string
  /** ⚠️ That receipt's quantities. Strings, as everywhere else here. */
  ambQuantity?: string | null
  quantityAt20C?: string | null
  /**
   * ⚠️ That receipt's reconciliation figures. `null` when unset — the form omits
   * a blank `gainQty` rather than sending zero, which is why it comes back null
   * rather than `"0"`.
   */
  lossQty?: string | null
  gainQty?: string | null
  /** ⚠️ That receipt's tolerance rate, copied from the item when it was raised. */
  toleranceRate?: string | null
}

/**
 * Sent as **`multipart/form-data`** — the third such endpoint, after cargo and
 * T1 validation, because the record carries an uploaded document. A JSON body
 * is refused outright with `406 FST_INVALID_MULTIPART_CONTENT_TYPE`.
 *
 * ⚠️ **`quantity` is gone**, replaced by the same `ambQuantity` /
 * `quantityAt20C` pair as cargo and nominations. Sending only the old field now
 * fails validation with *both* new names reported missing.
 *
 * Five fields are **required**: `t1ValidationId`, `itemId`, `deportId`,
 * `ambQuantity` and `quantityAt20C` — verified from the empty-body error, which
 * names exactly those. Everything below them is optional; omitting any of them
 * passes validation and reaches the record lookup.
 *
 * ⚠️ The reconciliation figures are **not validated for sign or consistency**:
 * negatives and zeroes pass, and `quantityAt20C` may exceed `ambQuantity`. The
 * form enforces what it sensibly can rather than relying on the server.
 */
export interface CentralStockRequest {
  t1ValidationId: string
  itemId: string
  deportId: string
  /**
   * Both **numbers**, and both required. Ambient is what was measured;
   * `quantityAt20C` is that figure temperature-corrected.
   */
  ambQuantity: number
  quantityAt20C: number
  /**
   * Optional reconciliation figures, all validated as **numbers** — a
   * non-numeric string is rejected, but any sign is accepted.
   *
   * `toleranceRate` is the allowance within which a discrepancy is not treated
   * as a loss; `lossQty` and `gainQty` record the discrepancy itself.
   */
  toleranceRate?: number
  lossQty?: number
  gainQty?: number
  /**
   * Optional customs and shipping references, all plain strings with no
   * validated format — an empty string is accepted, so blanks are omitted
   * rather than sent.
   *
   * ⚠️ `customOffice` and `transitNumbering` are **also** fields of the T1
   * validation's `extraValidations` entries. They are recorded again here
   * because a receipt may be cleared through a different office than the one
   * the transit was raised under.
   */
  customOffice?: string
  transitNumbering?: string
  blRef?: string
  /** Optional upload, sent as `supportingDocUrl` — see `T1ValidationRequest`. */
  supportingDoc?: File
}

/**
 * Adjusts a central stock record up or down.
 *
 * ⚠️ **Note the doubled `l`: `reconcilliationIn` / `reconcilliationOut`.** The
 * path and the surrounding fields use the correct single-`l` spelling
 * (`reconciliationType`, `reconciledQuantity`), so only the *values* are
 * misspelled. Sending the correct spelling would be rejected.
 */
export const RECONCILIATION_TYPES = ['reconcilliationIn', 'reconcilliationOut'] as const
export type ReconciliationType = (typeof RECONCILIATION_TYPES)[number]

/**
 * Whether the adjusted quantity is customs-cleared.
 *
 * Both values are confirmed live: the list's `clearanceQuantitiesByStatus`
 * reports `{ uncleared: 510 }`, and every clearance carries `status:
 * "uncleared"`.
 */
export const RECONCILIATION_STATES = ['cleared', 'uncleared'] as const
export type ReconciliationState = (typeof RECONCILIATION_STATES)[number]

/**
 * Sent as **JSON** to `POST /central-stock/reconciliation` — unlike
 * `CentralStockRequest`, which is multipart, because no document is uploaded.
 *
 * 🔴 **The route does not exist yet.** Every spelling tried returns `404
 * ROUTE_NOT_FOUND` rather than a validation error, which is how a missing route
 * differs from a rejected body. The schema is clearly in place server-side —
 * rows already carry `reconciledQuantity` and a `clearances[]` array, and the
 * summary reports `reconciledQuantity` — so only the endpoint is absent. The UI
 * is wired and will work unchanged once it ships.
 *
 * ⚠️ `quantity` is a **string**, per the supplied body — the multipart create
 * takes a number.
 */
export interface ReconciliationRequest {
  centralStockId: string
  quantity: string
  reconciliationType: ReconciliationType
  state: ReconciliationState
}

/* ------------------------------------------------------------------ */
/* T1 validation                                                       */
/* ------------------------------------------------------------------ */

/** Shares the three-state lifecycle cargo uses, but `confirmed` not `approved`. */
export const T1_STATUSES = ['pending', 'confirmed', 'cancelled'] as const
export type T1Status = (typeof T1_STATUSES)[number]

/**
 * One customs-office check against a T1 validation.
 *
 * ⚠️ **This is where the status lives** — the parent record has none. The status
 * endpoint takes *this* record's id, not the parent's.
 */
export interface T1ExtraValidation {
  id: string
  t1ValidationId: string
  customOffice: string
  transitNumbering: string
  status: T1Status
  createdAt?: string
  updatedAt?: string
}

/**
 * A T1 transit validation raised against a nomination.
 *
 * ⚠️ **`customOffice` and `transitNumbering` are required on create but are not
 * fields of this record** — they create the first `extraValidations` entry. The
 * detail endpoint returns neither, which is why the edit form cannot round-trip
 * them.
 *
 * ⚠️ The list and detail shapes differ, as with PFI and nominations, and they
 * are close to **disjoint**:
 *
 * - the **list** nests `nomination` and `extraValidations` but omits
 *   `nominationId`, `createdAt` and `updatedAt`;
 * - the **detail** returns those three and nothing else — no `nomination`, no
 *   `extraValidations`.
 *
 * So every field but `id`, `exportingCountry` and `supportingDocUrl` is
 * optional here, and which ones are actually populated depends on where the
 * record came from.
 */
export interface T1Validation {
  id: string
  /**
   * ⚠️ **Detail only.** The list dropped this field — read
   * `nomination.id` there instead, which the nested object still carries.
   */
  nominationId?: string
  exportingCountry: string
  /** An uploaded document; absent when none was attached. */
  supportingDocUrl?: string
  /** List only. Each entry carries its own status. */
  extraValidations?: T1ExtraValidation[]
  /**
   * List only.
   *
   * ⚠️ **A trimmed nomination**, and trimmed differently from the `/nominations`
   * list: it carries `id`, both quantities, `stockId`, a nested `stock.item`
   * and a `timeLine`, but **no `destination` and no `driverVehicle`**. Anything
   * reading those here gets `undefined`.
   *
   * ⚠️ Its quantity followed the `/nominations` rename — `quantityAt20C` and
   * `ambQuantity`, with no plain `quantity`. Read it through
   * {@link nominationQuantity} rather than by hand.
   */
  nomination?: Nomination
  /** Detail only — the list omits both timestamps. */
  createdAt?: string
  updatedAt?: string
}

/**
 * Sent as **`multipart/form-data`** — the second such endpoint in this API after
 * cargo, because the record carries an uploaded document.
 *
 * Four fields are **required**: `nominationId`, `exportingCountry`,
 * `customOffice`, `transitNumbering`. The last two seed the first
 * `extraValidations` entry rather than living on the parent.
 */
export interface T1ValidationRequest {
  nominationId: string
  exportingCountry: string
  /** Seeds the first extra validation — not a field of the parent record. */
  customOffice: string
  /** Likewise. */
  transitNumbering: string
  /**
   * Optional upload. Omitted entirely when no file was chosen.
   *
   * ⚠️ Sent under the form field name **`supportingDocUrl`**, matching the
   * working request this was built from — note that cargo uses `supportingDoc`
   * for the same thing. The API does not reject an unknown file field name, so
   * this could not be confirmed by probing; only a successful upload would show
   * it, and that would mean writing a record.
   */
  supportingDoc?: File
}

/* ------------------------------------------------------------------ */
/* PFI and currencies                                                  */
/* ------------------------------------------------------------------ */

/** A currency PFIs can be denominated in. Lives under `/pfi/currency`. */
export interface Currency {
  id: string
  code: string
  name: string
  /** Returned as a string; sent as a number. */
  rate: string
  createdAt?: string
  updatedAt?: string
}

/**
 * Sent as JSON. All three fields are **required**.
 *
 * There is no GET-by-id, `PATCH` or `DELETE` — only list, create and
 * `PUT /pfi/currency/:id`.
 */
export interface CurrencyRequest {
  code: string
  name: string
  /** Must be a **number**. */
  rate: number
}

/**
 * A proforma invoice raised against a nomination.
 *
 * ⚠️ **Two of the API's field names are misspelled, in different ways.** Both are
 * reproduced verbatim because they are the wire format:
 * - `currancyCode` — "currancy", on both read and write.
 * - `pifCode` — "pif", not "pfi". **Server-generated**, so it is never sent.
 *
 * ⚠️ The list and detail shapes differ, as with nominations: the **list nests
 * `currency`**, while the **detail returns a flat `currencyId`** instead. The
 * table renders from the list; the edit form reads the detail.
 */
export interface Pfi {
  id: string
  nominationId: string
  /** Detail only — the list nests `currency` instead. */
  currencyId?: string
  /**
   * ⚠️ Stored verbatim and **not validated against `currencyId`'s own code** —
   * the two can disagree. The form always derives it from the selected
   * currency so they cannot drift.
   */
  currancyCode: string
  /** Returned as a string; sent as a number. */
  amount: string
  /**
   * ⚠️ **Optional on the response only because it is unverified.** `unitPrice`
   * was added to the *request* and is required there, but the PFI list was
   * empty when that was confirmed, so whether the response returns it is
   * unknown. Tighten once a PFI exists to check.
   */
  unitPrice?: string
  /** Returned as a string; sent as a number. Optional on create. */
  rate?: string
  /** Present when a document path was recorded. */
  supportingDocUrl?: string | null
  /** The user's own reference for the invoice. */
  pfiReference: string
  /** **Server-generated** (`PFI…`). Never sent on create or update. */
  pifCode?: string
  /** List only. */
  currency?: Currency
  createdAt?: string
  updatedAt?: string
}

/**
 * Query parameters for `GET /pfi`. Both optional, both validated when present,
 * so an unset one must be **omitted entirely** — `startDate=` returns `400`.
 *
 * Both filters returned wrong results during development — the unfiltered list
 * came back empty while records existed, and the dates behaved as though
 * reversed. **Fixed server-side and re-verified**: the unfiltered list returns
 * every record, and both bounds now filter in the expected direction.
 */
export interface PfiFilter {
  /** ISO 8601 instant. */
  startDate?: string
  endDate?: string
}

/**
 * Sent as JSON. All six fields are **required** — confirmed from the API's own
 * rejection of a body containing none of them.
 *
 * `pifCode` is deliberately absent: the server generates it.
 */
export interface PfiRequest {
  nominationId: string
  currencyId: string
  /** Derived from the chosen currency — see the warning on `Pfi`. */
  currancyCode: string
  /**
   * ⚠️ **`unitPrice` was added, not a rename** — `amount` is still required.
   * Both are numbers, and both must be sent.
   *
   * They are **not derived from each other**: with a nomination of 2,499 and a
   * documented example of `unitPrice: 240000` / `rate: 1500`, no product or
   * quotient of the three lands on a matching figure. So `amount` is entered
   * rather than computed — the form used to fill it from `quantity x rate`,
   * which no longer holds.
   */
  amount: number
  unitPrice: number
  /**
   * ⚠️ **Optional**, despite appearing in the documented body — it is absent
   * from the API's own list of missing fields. The FX rate for the currency.
   */
  rate?: number
  /**
   * ⚠️ **Optional**, and an actual **upload** — not the path string the
   * documented body suggests.
   *
   * Confirmed live: posting `multipart/form-data` with a real file attached
   * parses successfully (it reaches the record lookup rather than being
   * refused), so the endpoint accepts a file. The field is named
   * `supportingDocUrl` on the wire, matching cargo, central stock and T1.
   */
  supportingDoc?: File | null
  pfiReference: string
}

/* ------------------------------------------------------------------ */
/* Cargo                                                               */
/* ------------------------------------------------------------------ */

/** Cargo has its own lifecycle — not the `active`/`inactive` used elsewhere. */
export const CARGO_STATUSES = ['pending', 'approved', 'cancelled'] as const
export type CargoStatus = (typeof CARGO_STATUSES)[number]

/**
 * A shipment received against an order, held at a deport.
 *
 * The list and detail endpoints carry the relations differently:
 * - **list** nests full `order` and `deport` objects, plus a `stocks` array
 * - **detail** returns flat `orderId` and `deportId`, and none of the nesting
 *
 * The list is therefore enough to render the table, but the edit form still
 * fetches the record — the flat ids are what its dropdowns bind to.
 *
 * `quantity` is returned as a **string** but must be sent as a number.
 */
/**
 * One line of stock received against a cargo. **Newly confirmed** — this array
 * used to come back empty on every record, so its element shape was typed as
 * `unknown[]`. It is now the source of the quantity actually taken into stock,
 * separate from whatever the cargo record itself reports.
 */
export interface CargoStock {
  id: string
  item?: StockItem
  itemId?: string
  /** Arrives as a string, like every other quantity in this API. */
  quantity: string
  receivedDate?: string
  status?: string
}

export interface Cargo {
  id: string
  vesselName: string
  receivedDate: string
  /**
   * ⚠️ **Absent on every record in a live list response as of September 2026**,
   * despite being typed as required here and still required to *create* a
   * cargo (`CargoRequest`). Read as optional so a shipment missing it does not
   * crash the page; worth confirming with the backend whether this is a
   * deliberate drop from the list endpoint or a regression.
   */
  expirationDate?: string
  /**
   * ⚠️ **No longer present on the list response.** These used to be required,
   * required-as-numbers-on-write, `quantity`-replacing fields. A live payload
   * now shows neither of them — only `quantityInKg` / `quantityInLitre` below,
   * both `"0"` on every record seen. Kept optional, not deleted: `CargoRequest`
   * (create/edit) still requires them, so the write side may be unaffected —
   * this looks like a **list-endpoint-only** change, unconfirmed either way.
   */
  ambQuantity?: string
  quantityAt20C?: string
  /**
   * ⚠️ **New, unconfirmed fields**, seen for the first time on this same list
   * response — always `"0"` so far on every record, including ones with real
   * stock behind them (see `stocks[]`). Until a non-zero example turns up,
   * treat these as unpopulated rather than as the real quantity; the page
   * prefers `stocks[]` for that.
   */
  quantityInKg?: string
  quantityInLitre?: string
  blRef: string
  supportingDocUrl: string | null
  tansisRef: string | null
  outurnRef: string | null
  status: CargoStatus
  /** List endpoint only — the detail returns a flat `orderId` instead. */
  order?: {
    id: string
    orderCode: string
    orderDate: string
    quantity: string
  }
  /** List endpoint only — the detail returns a flat `deportId` instead. */
  deport?: Deport
  /**
   * List endpoint only. Was empty on every record seen previously; now
   * populated — see `CargoStock`.
   */
  stocks?: CargoStock[]
  /**
   * The invoices raised against this shipment. **List endpoint only** — the
   * detail omits it.
   *
   * This is the only working way to read them: `GET /cargo-invoices/{cargoId}`
   * rejects every real cargo id as "Must be a valid UUID" while cargo ids are
   * cuids, so the invoices page reads them from here instead of that route.
   * See {@link CargoInvoice}.
   */
  cargoInvoices?: CargoInvoice[]
  /** Detail endpoint only. */
  orderId?: string
  /** Detail endpoint only. */
  deportId?: string
  createdAt?: string
  updatedAt?: string
}

/**
 * Sent as **`multipart/form-data`**, not JSON — cargo is the only endpoint in
 * this API that takes a file upload, so a JSON body is rejected outright with
 * `406 FST_INVALID_MULTIPART_CONTENT_TYPE`.
 *
 * Required: `orderId`, `deportId`, `vesselName`, `receivedDate`,
 * `expirationDate`, `quantity`, `blRef`. The two refs and the document are
 * optional.
 */
export interface CargoRequest {
  orderId: string
  deportId: string
  vesselName: string
  /** ISO 8601 instant. */
  receivedDate: string
  expirationDate: string
  /**
   * ⚠️ **Two quantities now, both required and both numbers.** `quantity` is
   * gone from this API entirely.
   *
   * `ambQuantity` is the volume at ambient temperature; `quantityAt20C` is the
   * same volume corrected to 20 °C, which is the figure the trade settles on.
   *
   * 🔴 **The order ceiling is checked against `quantityAt20C` only.** A huge
   * `ambQuantity` with a small `quantityAt20C` is accepted; the reverse is
   * refused with `The Cargo Quantities must be less than or equal to ordered
   * quanties.` — so the corrected figure is the one bounded by the order.
   */
  ambQuantity: number
  quantityAt20C: number
  blRef: string
  tansisRef?: string
  outurnRef?: string
  /** The uploaded file; the API stores it and returns `supportingDocUrl`. */
  supportingDoc?: File | null
}

/* ------------------------------------------------------------------ */
/* Cargo invoices                                                      */
/* ------------------------------------------------------------------ */

/**
 * A supplier invoice raised against a cargo shipment.
 *
 * 🔴 **This feature cannot currently be created against real data.** The create
 * schema validates `cargoId` as a **UUID**, but every cargo id the API issues is
 * a **cuid** (`cmtl78d410001lyym8ietxjej`, 25 chars, no dashes). Posting a real
 * cargo id therefore fails validation before the cargo is ever looked up:
 *
 * ```
 * POST /cargo-invoices { cargoId: 'cmtl78d410001lyym8ietxjej', ... }
 *   → 400 { field: 'cargoId', message: 'Must be a valid UUID' }
 * ```
 *
 * The frontend is written correctly and will work unchanged once the server
 * relaxes that rule to accept a cuid. Verified against both cargo records in
 * the system; the same split affects `DELETE` and the list route, which also
 * demand a UUID in the path.
 *
 * ⚠️ Amounts and quantities come back as **strings**, as everywhere else here.
 */
export interface CargoInvoice {
  id: string
  cargoId: string
  quantity: string
  unitPrice: string
  amount: string
  currencyCode: string
  invoiceCode: string
  invoiceReference: string
  /** A stored path under `/uploads/`; absent when none was attached. */
  supportingDocUrl?: string | null
  createdAt?: string
  updatedAt?: string
}

/**
 * Sent as **`multipart/form-data`**, so the supporting document can be uploaded.
 *
 * ⚠️ Unusually, this endpoint accepts **either** encoding — unlike cargo, T1
 * validation and central stock, which refuse JSON outright with `406
 * FST_INVALID_MULTIPART_CONTENT_TYPE`. Multipart is used because it is the only
 * form that can carry a file; the fields validate identically either way.
 *
 * All seven of `quantity`, `unitPrice`, `amount`, `currencyCode`, `cargoId`,
 * `invoiceCode` and `invoiceReference` are **required** — verified from the
 * empty-body error, which names exactly those.
 *
 * ⚠️ `amount` is **not** checked against `quantity × unitPrice`; the API accepts
 * any figure. The form computes it as a convenience but leaves it editable,
 * since only the server's stored value matters.
 */
export interface CargoInvoiceRequest {
  /**
   * 🔴 Validated as a UUID even though cargo ids are cuids — see
   * {@link CargoInvoice}. Nothing the frontend sends can satisfy both.
   */
  cargoId: string
  /** Numbers, not strings. Both must be **greater than zero** — `0` is rejected. */
  quantity: number
  unitPrice: number
  amount: number
  /**
   * The currency's `code` (`RWF`, `USD`), not its id.
   *
   * ⚠️ Unvalidated against the currency list — a bogus `ZZZ` passes schema
   * validation and only fails later on the cargo lookup, so the form restricts
   * the choice to real currencies itself.
   */
  currencyCode: string
  invoiceCode: string
  invoiceReference: string
  /**
   * The uploaded file; the API stores it and returns `supportingDocUrl`.
   *
   * ⚠️ Sent under the form field name **`supportingDocUrl`** — the same name the
   * response uses for the stored path, as on T1 validation and central stock.
   * Only cargo spells its file field `supportingDoc`.
   *
   * ⚠️ The `/uploads/` string format rule applies **only under JSON**: sent as
   * text, an absolute URL or an empty string is rejected, but under multipart
   * the same values pass — which is how the field's upload behaviour was
   * confirmed without writing a record.
   */
  supportingDoc?: File | null
}

/* ------------------------------------------------------------------ */
/* Drivers                                                             */
/* ------------------------------------------------------------------ */

/**
 * One vehicle assigned to a driver.
 *
 * ⚠️ The outer `id` is the **assignment record**, not the vehicle — the vehicle
 * sits nested under `vechile`, which is the API's spelling (missing `h`).
 */
export interface DriverVehicleAssignment {
  /** The assignment's own id, not the vehicle's. */
  id: string
  vechile: {
    id: string
    platNumber: string
    model: string
    status: UnitStatus
  }
}

/**
 * A driver employed by a transporter.
 *
 * ⚠️ **The passport field is spelled differently on write and read**: the API
 * accepts `paassport` (two `a`s) but returns `passport` (one). See
 * `DriverRequest`.
 *
 * The list and detail endpoints carry different fields:
 * - `transporterId` — **detail only**
 * - `vehicles` — **list only**
 */
export interface Driver {
  id: string
  names: string
  phone: string
  /** The API's spelling of "licence". */
  lisence: string
  passport: string
  status: UnitStatus
  /** Detail endpoint only — the list omits it. */
  transporterId?: string
  /** List endpoint only — the detail omits it. */
  vehicles?: DriverVehicleAssignment[]
  createdAt?: string
  updatedAt?: string
}

/** All five fields are required — verified against the API's own rejection. */
export interface DriverRequest {
  names: string
  phone: string
  lisence: string
  /** ⚠️ Two `a`s on the way in; the response spells it `passport`. */
  paassport: string
  transporterId: string
}

/* ------------------------------------------------------------------ */
/* Vehicles                                                            */
/* ------------------------------------------------------------------ */

/**
 * A truck belonging to a transporter.
 *
 * The list nests a `transport` summary **and** keeps the flat `transporterId`,
 * so a row can seed the edit form without a second request — unlike orders.
 *
 * `tankCapacity` is returned as a **string** but must be sent as a number.
 */
export interface Vehicle {
  id: string
  /** The API's spelling — one `e`. */
  platNumber: string
  transporterId: string
  truckNumber: string
  trailerNumber: string
  model: string
  tankCapacity: string
  status: UnitStatus
  /** Present on the list; the detail endpoint returns timestamps instead. */
  transport?: {
    id: string
    name: string
    address: string
  }
  createdAt?: string
  updatedAt?: string
}

/** All six fields are required — verified against the API's own rejection. */
export interface VehicleRequest {
  platNumber: string
  transporterId: string
  truckNumber: string
  trailerNumber: string
  model: string
  /**
   * Sent as a number. The API's empty-body rejection says it expects one, but a
   * numeric string is in fact accepted too — so this is the stricter of the two
   * shapes rather than the only one that works.
   */
  tankCapacity: number
}

/* ------------------------------------------------------------------ */
/* Transporters                                                        */
/* ------------------------------------------------------------------ */

/**
 * A haulage company. The list omits `updatedAt`, which the detail endpoint
 * includes; both are otherwise the same shape.
 */
export interface Transporter {
  id: string
  name: string
  phone: string
  address: string
  tinNumber: string
  status: UnitStatus
  createdAt: string
  updatedAt?: string
}

/** All four fields are required — verified against the API's own rejection. */
export interface TransporterRequest {
  name: string
  phone: string
  address: string
  tinNumber: string
}

/* ------------------------------------------------------------------ */
/* Deports                                                             */
/* ------------------------------------------------------------------ */

export const DEPORT_TYPES = ['local', 'foreign', 'international'] as const
export type DeportType = (typeof DEPORT_TYPES)[number]

/**
 * A storage depot. `status` follows the same `active`/`inactive` convention as
 * units, items, and suppliers.
 */
export interface Deport {
  id: string
  name: string
  type: DeportType
  location: string
  status: UnitStatus
}

/**
 * `name` and `location` are the only fields the API requires — `type` is
 * optional server-side, though it is always present on a returned row and is
 * rejected unless it is one of `DEPORT_TYPES`. The form requires it anyway,
 * since a deport with no type would be meaningless to the user.
 */
export interface DeportRequest {
  name: string
  type: DeportType
  location: string
}

/* ------------------------------------------------------------------ */
/* Orders                                                              */
/* ------------------------------------------------------------------ */

/**
 * A row of `GET /orders`.
 *
 * ⚠️ The nested objects carry **no ids** — only display fields — so a row
 * cannot be mapped back to its supplier, item, or plan. That is why editing an
 * order is not offered from the table: the form needs `supplierId`, `itemId`,
 * and `orderPlanId`, none of which the list provides.
 *
 * `quantity` arrives as a **string**, not a number.
 */
export interface Order {
  id: string
  /** Present on the list, though the flat `OrderDetail` is what editing binds to. */
  orderPlanId?: string
  /** Human-facing reference, e.g. `ORD-CA8E0AAC59A1`. */
  orderCode: string
  orderDate: string
  /** The amount ordered. A string, like every quantity in this API. */
  quantity: string
  item: {
    id?: string
    name: string
    status: UnitStatus
    /** The unit the quantity is expressed in — `LT`, `MT`, … */
    baseUnit: Unit
  }
  supplier: {
    id?: string
    name: string
    phone: string
  }
  /** The plan this order belongs to, nested on the list. */
  plan?: {
    id: string
    name: string
  }
  createdUser: {
    firstName: string
    lastName: string
  }
  /**
   * Cargo raised against this order.
   *
   * ⚠️ **Heavily trimmed** — each entry carries only a `stocks` array, and each
   * stock only a `quantity`. There is no cargo id, vessel name or date here, so
   * the deliveries can be totalled and listed but not individually identified.
   */
  cargos?: Array<{
    stocks?: Array<{ quantity: string }>
  }>
  /**
   * The **sum of every nested stock quantity** — a delivered total, not a count
   * of cargo records. Confirmed against live data: an order with stocks of
   * 50 + 40 + 40 reports `130`.
   *
   * A **number**, where `quantity` is a string.
   */
  stockCargos?: number
  /**
   * What is still outstanding: `quantity - stockCargos`, computed server-side.
   *
   * ⚠️ **Goes negative when an order is over-delivered** — an order for 100 with
   * 130 delivered reports `-30`. Anything treating this as a remaining balance
   * must handle that rather than assuming it is non-negative.
   *
   * A **number**, like `stockCargos`.
   */
  remainingStock?: number
}

/**
 * `GET /orders/:id` — a **flat** record carrying the foreign keys the list
 * omits, which is what makes editing possible.
 *
 * Like the list, `quantity` arrives as a string.
 */
export interface OrderDetail {
  id: string
  orderCode: string
  supplierId: string
  orderDate: string
  itemId: string
  createdByUserId: string
  orderPlanId: string
  quantity: string
  createdAt: string
  updatedAt: string
}

export interface OrderRequest {
  supplierId: string
  /** ISO 8601 instant. */
  orderDate: string
  itemId: string
  orderPlanId: string
  quantity: number
}

/* ------------------------------------------------------------------ */
/* Suppliers                                                           */
/* ------------------------------------------------------------------ */

/**
 * A row of `GET /suppliers`. The list **nests** the supplier type as an object;
 * `GET /suppliers/:id` returns a flat `supplierTypeId` instead, plus timestamps.
 */
export interface Supplier {
  id: string
  name: string
  phone: string
  address: string
  tinNumber: string
  status: UnitStatus
  supplierType: SupplierType
}

export interface SupplierDetail {
  id: string
  name: string
  phone: string
  address: string
  tinNumber: string
  supplierTypeId: string
  status: UnitStatus
  createdAt: string
  updatedAt: string
}

export interface SupplierRequest {
  name: string
  phone: string
  address: string
  tinNumber: string
  supplierTypeId: string
}

/* ------------------------------------------------------------------ */
/* Items                                                               */
/* ------------------------------------------------------------------ */

/**
 * An alternate unit an item can be measured in, and how it converts to the
 * item's base unit. `factorialValue` is how many base units one of these
 * equals — a Box of 12 Litres is `{ unitId: <Box>, factorialValue: 12 }`.
 */
export interface ItemUnitLink {
  id?: string
  unitId: string
  /** Must be a **number**; the API rejects a numeric string. */
  factorialValue: number
  unit?: Unit
}

/**
 * A node of `GET /items`, which returns a **nested tree, not a paginated
 * envelope**. Children arrive under `items`; the node carries no `parentId`.
 *
 * Note the field is `descriptions` (plural) — that is the API's spelling, in
 * both the request and the response.
 */
export interface ItemNode {
  id: string
  name: string
  baseUnitId: string
  descriptions: string | null
  items: ItemNode[]
}

/**
 * `GET /items/:id` returns a **flat** record instead, with `parentId` and
 * `status` that the tree omits — and without the `items` array.
 */
export interface ItemDetail {
  id: string
  name: string
  descriptions: string | null
  parentId: string | null
  baseUnitId: string
  status: UnitStatus
  createdAt: string
  updatedAt: string
}

export interface ItemRequest {
  name: string
  /** The API's spelling — plural. Optional. */
  descriptions?: string
  /** Optional parent item, for grouping variants under a product. */
  parentId?: string | null
  baseUnitId: string
  /**
   * Accepted by create and update, but **never returned by any endpoint**, so
   * it cannot be read back or pre-filled when editing.
   */
  units?: Array<{ unitId: string; factorialValue: number }>
}

/**
 * The allowance within which a measured discrepancy is not treated as a loss.
 *
 * Set **per item** — the central-stock receipt carries its own `toleranceRate`
 * for the figure actually applied, and this is the ceiling that governs it.
 *
 * ⚠️ The route is **`/item-tolerance-rates`** (plural, hyphenated).
 */
export interface ItemToleranceRate {
  id: string
  itemId: string
  /**
   * Arrives as a string, like every other numeric field in this API — the
   * request takes a number.
   */
  maxRate: string
  /** Present on some endpoints; not relied on. */
  item?: ItemDetail
  createdAt?: string
  updatedAt?: string
}

/**
 * Sent as **JSON**. Both fields are required — verified from the empty-body
 * error, which names exactly these two.
 *
 * ⚠️ `maxRate` must be a **number**, not the string the documented body shows,
 * and is bounded **`>= 0`**. There is no upper bound: `101` passes validation
 * as readily as `100`, so nothing here assumes it is a percentage.
 */
export interface ItemToleranceRateRequest {
  itemId: string
  maxRate: number
}

/** The four positions `PUT /users/:id` accepts, named by its own rejection. */
export const USER_POSITIONS = [
  'superAdmin',
  'siteManager',
  'clientAdmin',
  'clientUser',
] as const
export type UserPosition = (typeof USER_POSITIONS)[number]

export interface User {
  id: string
  email: string
  firstName: string
  lastName: string
  phone: string | null
  isActive: boolean
  role: RoleRef
  /** One of `USER_POSITIONS`, or null before one is assigned. */
  position: UserPosition | null
  /** The site this user is assigned to. */
  siteId: string | null
  clientId?: string | null
  client?: { id: string; name: string } | null
  /** Assignments, each wrapping a full site — see `AssignedSite`. */
  sites?: AssignedSite[]
  createdAt: string
  updatedAt?: string
}

/**
 * Body of `PUT /users/:id`. Every field is optional, but **at least one
 * recognised field must be present** — an empty body is rejected with
 * `_root: At least one field is required`.
 *
 * ⚠️ **`siteId` alone does not satisfy that rule here**: sending only `siteId`
 * to this endpoint is rejected as though the body were empty. Site assignment
 * therefore uses the dedicated `PATCH /users/:id/site` instead — see
 * `AssignSiteRequest`.
 */
export interface UpdateUserRequest {
  firstName?: string
  lastName?: string
  phone?: string
  roleId?: string
  position?: UserPosition
  siteId?: string
}

/**
 * Body of **`PATCH /users/:id/site`** — the dedicated site assignment.
 *
 * ⚠️ **`PATCH` only.** `PUT` and `POST` on this path both return
 * `ROUTE_NOT_FOUND`, which is the opposite of `/users/:id` (a `PUT`).
 *
 * `siteId` is **required and must be a valid UUID**: an empty body, `""` and
 * `null` are all rejected with `Must be a valid UUID`. There is therefore **no
 * way to unassign** a user through this endpoint.
 */
export interface AssignSiteRequest {
  siteId: string
}

export interface CreateUserRequest {
  email: string
  /** At least 8 characters. */
  password: string
  firstName: string
  lastName: string
  roleId: string
  /**
   * Short numeric code for in-app confirmation, separate from the password.
   * Optional; 4–8 digits when present.
   */
  pin?: string
  phone?: string
}

/** A permission attached to a role, through the join table. */
export interface RolePermissionLink {
  id: string
  roleId: string
  permissionId: string
  permission: ModulePermission
}

export interface RoleEntity {
  id: string
  name: string
  /** Seeded roles (e.g. Administrator) — cannot be deleted. */
  isFixed: boolean
  isActive: boolean
  createdAt: string
  updatedAt: string
  permissions: RolePermissionLink[]
}

export interface CreateRoleRequest {
  name: string
  /** Optional — a role can be created with no permissions. */
  permissionIds?: string[]
}

/**
 * Body of PUT /roles/assign-permissions/:roleId.
 *
 * ⚠️ `name` is written verbatim — sending `""` blanks the role's name rather
 * than leaving it unchanged. Always send the intended name.
 */
export interface AssignRolePermissionsRequest {
  name: string
  permissionIds: string[]
}

/** Convenience: the API returns first/last separately, never a full name. */
export function fullName(user: Pick<AuthUser, 'firstName' | 'lastName' | 'email'>): string {
  return `${user.firstName} ${user.lastName}`.trim() || user.email
}

/* ------------------------------------------------------------------ */
/* Supply chain reports                                                */
/* ------------------------------------------------------------------ */

/**
 * Query parameters shared by every `/supply-chain-report` endpoint.
 *
 * ⚠️ **These are query parameters on a `GET`, not a JSON body.** Every one of
 * the seven routes is `GET`-only — `POST` returns `ROUTE_NOT_FOUND` — so the
 * documented `{dates: {from, to}, …}` body does not apply.
 *
 * ⚠️ The dates are **`startDate` / `endDate`**, matching the rest of this API.
 * `from`/`to` and `dates[from]`/`dates[to]` are accepted by the server and then
 * **silently ignored** — a bad value under those names returns `200`, while
 * `startDate=notadate` correctly returns `400`. That silence is why they are
 * named explicitly here rather than passed through from a form.
 */
export interface SupplyChainReportFilter {
  /** ISO 8601 instants. Both optional, and both genuinely narrow the result. */
  startDate?: string
  endDate?: string
  /**
   * ⚠️ Note the `by` prefix on these two. `supplierId` and `orderPlanId` are
   * silently ignored — verified: a non-existent id under the wrong name returns
   * every row rather than none.
   */
  bySupplierId?: string
  byOrderPlanId?: string
  itemId?: string
  deportId?: string
  orderCode?: string
  page?: number
  limit?: number
}

/**
 * The totals block the five **order** report endpoints all return.
 *
 * Identical across all five — the grouping changes what `details.items` holds,
 * never the summary, so a page may keep one summary on screen while switching
 * between groupings.
 */
export interface OrderReportSummary {
  totalOrders: number
  totalOrderedQuantity: number
  totalCargos: number
  totalCargoAmbientQuantity: number
  totalCargoQuantityAt20C: number
  /** Cargo count and quantities per status, e.g. `{ approved: {…} }`. */
  cargosByStatus: Record<
    string,
    { count: number; ambientQuantity: number; quantityAt20C: number }
  >
}

/**
 * The envelope the five order report endpoints return.
 *
 * ⚠️ Note the nesting: `details` wraps its own `{items, pagination}`, unlike the
 * two central-stock report routes which put `items` and `pagination` at the top
 * level beside `summary`. Two shapes across one feature.
 */
export interface OrderReportResponse<T> {
  summary: OrderReportSummary
  details: Paginated<T>
}

/** One order, as `/order-details` returns it — the ungrouped view. */
export interface OrderReportDetail {
  id: string
  orderCode: string
  orderDate: string
  quantity: number
  item?: StockItem
  supplier?: Supplier
  plan?: { id: string; name: string; status: string; startDate?: string; endDate?: string }
  createdUser?: { id: string; firstName: string; lastName: string; email?: string }
  /** The shipments raised against this order. */
  cargos?: {
    id: string
    vesselName: string
    blRef?: string
    tansisRef?: string | null
    outurnRef?: string | null
    ambQuantity: number
    quantityAt20C: number
    status: string
    receivedDate?: string
    expirationDate?: string
    deport?: Deport
  }[]
  createdAt?: string
  updatedAt?: string
}

/** One supplier's totals — `/order-report/by-supplier`. */
export interface OrderReportBySupplier {
  id: string
  name: string
  address?: string
  phone?: string
  status: string
  tinNumber?: string
  supplierType?: { id: string; type: string; status?: string }
  totalOrders: number
  orderedQuantity: number
  /** What actually arrived, temperature-corrected. */
  receivedQuantityAt20C: number
}

/** One item's totals — `/order-report/by-item`. */
export interface OrderReportByItem {
  id: string
  name: string
  descriptions?: string | null
  status: string
  baseUnit?: { id: string; name: string; code: string }
  toleranceRates?: ItemToleranceRate[]
  totalOrders: number
  orderedQuantity: number
  receivedQuantityAt20C?: number
}

/** One deport's totals — `/order-report/by-deport`. */
export interface OrderReportByDeport {
  id: string
  name: string
  status: string
  type?: string
  location?: string
  totalCargos: number
  ambientQuantity: number
  quantityAt20C: number
  /** Cargo count per status, e.g. `{ approved: 2 }`. */
  cargosByStatus?: Record<string, number>
}

/** One plan's totals — `/order-report/by-order-plan`. */
export interface OrderReportByOrderPlan {
  id: string
  name: string
  status: string
  startDate?: string
  endDate?: string
  totalOrders: number
  orderedQuantity: number
}

/**
 * The two central-stock report endpoints.
 *
 * ⚠️ A **different envelope** from the order reports: `items` and `pagination`
 * sit at the top level beside `summary`, rather than nested under `details`.
 *
 * ⚠️ They also accept only **`itemId`** and the dates. `bySupplierId`,
 * `byOrderPlanId`, `deportId` and `orderCode` are all silently ignored here —
 * verified against a non-existent id, which returned every row.
 */
export interface CentralStockReportResponse<T, S> extends Paginated<T> {
  summary: S
}

/** Totals for `/supply-chain-report/central-stock`. */
export interface CentralStockReportSummary {
  stockCount: number
  totalAmbientQuantity: number
  totalQuantityAt20C: number
  totalGain: number
  totalLoss: number
  currentTransactionBalance: number
  transactionsByType: Record<string, { count: number; quantity: number }>
}

/** One receipt — `/supply-chain-report/central-stock`. */
export interface CentralStockReportRow {
  id: string
  ambQuantity: number
  quantityAt20C: number
  supportingDocUrl?: string | null
  status: string
  toleranceRate?: number | null
  lossQty?: number | null
  gainQty?: number | null
  item?: StockItem
  deport?: Deport
  t1Validation?: { id: string; exportingCountry: string; supportingDocUrl?: string | null }
  createdAt?: string
  updatedAt?: string
}

/** Totals for `/supply-chain-report/central-stock/transactions`. */
export interface CentralStockTransactionReportSummary {
  transactionCount: number
  byType: Record<string, { count: number; quantity: number }>
}

/** One movement — `/supply-chain-report/central-stock/transactions`. */
export interface CentralStockTransactionReportRow {
  id: string
  quantity: number
  /** `received`, `saleOut`, `reconcilliationIn`, `reconcilliationOut`. */
  type: string
  note?: string | null
  supportingDocUrl?: string | null
  centralStock?: {
    id: string
    status?: string
    item?: { id: string; name: string }
    deport?: { id: string; name: string; location?: string }
  }
  createdBy?: { id: string; firstName: string; lastName: string; email?: string }
  createdAt?: string
  updatedAt?: string
}
