import { apiClient } from '@/api/axios-instance'
import type {
  ListResponse,
  LoadingOrder,
  LoadingOrderRequest,
  ReceptionOrder,
  ReceptionRequest,
  StockoutOrder,
  StockoutOrderFilter,
  StockoutOrderRequest,
  StockoutOrdersResponse,
  StockoutOrderStatus,
} from '@/api/types'

export const stockoutOrdersService = {
  /**
   * ⚠️ Returns an **envelope** — `{ summary, breakdowns, orders }` — not a flat
   * array. It used to be an array; anything expecting one silently sees zero
   * rows.
   */
  list: (filter: StockoutOrderFilter = {}) => {
    // Both dates are validated when present, so blank values are stripped
    // rather than sent — `startDate=` returns 400, not "no filter".
    const params = Object.fromEntries(
      Object.entries(filter).filter(([, value]) => value !== undefined && value !== ''),
    )
    return apiClient<StockoutOrdersResponse>({
      url: '/stock-out-orders',
      method: 'GET',
      params,
    })
  },

  /**
   * ⚠️ Returns `data: null` for an unknown id rather than a `404`, so a caller
   * must check the result rather than relying on the request throwing.
   */
  get: (id: string) =>
    apiClient<StockoutOrder | null>({ url: `/stock-out-orders/${id}`, method: 'GET' }),

  /**
   * JSON. **Required**: `itemId`, `quantity`, `unitPrice`, `orderType`.
   *
   * `siteId` is required only for an `internal` order — see
   * `StockoutOrderRequest`. It is omitted rather than sent blank for `b2b`.
   */
  create: (body: StockoutOrderRequest) =>
    apiClient<StockoutOrder>({ url: '/stock-out-orders', method: 'POST', data: body }),

  /** Loading orders — stockout orders assigned to a vehicle for loading. */
  loadingOrders: () =>
    apiClient<LoadingOrder[]>({
      url: '/stock-out-orders/loading-orders',
      method: 'GET',
    }),

  /**
   * Assigns orders to a vehicle.
   *
   * Two ceilings apply — per order and per vehicle — see
   * `LoadingOrderRequest`. Both come back as `422` with a plain message rather
   * than field details.
   */
  createLoadingOrder: (body: LoadingOrderRequest) =>
    apiClient<LoadingOrder>({
      url: '/stock-out-orders/loading-orders',
      method: 'POST',
      data: body,
    }),

  /**
   * Records one approval against a loading order's authorisation chain.
   *
   * ⚠️ **`POST`, not `PUT`** — `PUT` and `PATCH` on this path both return
   * `ROUTE_NOT_FOUND`.
   *
   * ⚠️ Despite the `loading-order-authorizations` segment, the path id is the
   * **loading order's**, not an authorisation record's: a wrong id comes back as
   * `Loading order not found`. There is no way to address a single
   * authorisation, and no route lists them separately — they arrive nested on
   * the loading order as `authorizers[]`.
   *
   * Bodyless. A body is accepted but ignored, so none is sent — and no
   * `Content-Type` is stripped here because `POST` with no body does not trip
   * Fastify's empty-JSON check the way the bodyless `PUT`s do.
   *
   * 🔴 **Approve is the only verb.** `reject`, `decline`, `deny` and `cancel`
   * are all `ROUTE_NOT_FOUND`, so an authoriser who disagrees has nothing to
   * click — the UI says so rather than offering a button that cannot work.
   */
  /**
   * Loading orders seen from the receiving end, with their reception figures.
   *
   * A separate route from `/loading-orders`: same records, plus
   * `receptionStatus`, `receivedQuantity`, `remainingQuantity` and
   * `orderReceptions[]`. No `{id}` variant exists — the list is the only read.
   *
   * ⚠️ **Returns a paginated `{items, pagination}` envelope**, while its sibling
   * `/loading-orders` returns a bare array — two shapes on two adjacent routes.
   * Typed as `ListResponse` and read through `listRows`, which tolerates both;
   * assuming an array here threw `TypeError: find is not a function` and blanked
   * the page.
   */
  receptionOrders: () =>
    apiClient<ListResponse<ReceptionOrder>>({
      url: '/stock-out-orders/reception-orders',
      method: 'GET',
    }),

  /**
   * Receives a loading order's fuel into a cuve.
   *
   * ⚠️ **`POST`**, and the path id is the **loading order's**.
   *
   * 🔒 Site managers only — the API returns `403 FORBIDDEN` with
   * `"Only site managers can receive loading orders into a cuve"` for anyone
   * else. See `ReceptionRequest`.
   */
  receiveOrder: (id: string, body: ReceptionRequest) =>
    apiClient<ReceptionOrder>({
      url: `/stock-out-orders/reception-orders/${id}/receive`,
      method: 'POST',
      data: body,
    }),

  approveLoadingOrder: (id: string) =>
    apiClient<LoadingOrder>({
      url: `/stock-out-orders/loading-order-authorizations/${id}/approve`,
      method: 'POST',
    }),

  /**
   * **Sets** the status; the target state goes in the path.
   *
   * ⚠️ **`PUT /stock-out-orders/:id/status/:status`** — the id comes *before*
   * `status`. An earlier spelling (`/status/:id/:status`) was wrong and always
   * `404`ed, which is why this page was read-only. `PATCH`, `POST` and `GET`
   * are not routed.
   *
   * ⚠️ **Bodyless**, so `Content-Type` is stripped: with the header set and no
   * body, Fastify rejects it as `FST_ERR_CTP_EMPTY_JSON_BODY`.
   *
   * Unlike most status endpoints here this one **sets** rather than toggles —
   * there are four states, so a flip would be ambiguous.
   */
  setStatus: (id: string, status: StockoutOrderStatus) =>
    apiClient<StockoutOrder>({
      url: `/stock-out-orders/${id}/status/${status}`,
      method: 'PUT',
      headers: { 'Content-Type': null },
    }),
}
