import { apiClient } from '@/api/axios-instance'
import type { Authorizer, AuthorizerRequest } from '@/api/types'

/**
 * Authorizers live under the stockout-orders path but are their own module,
 * with their own `authorizers.*` permissions.
 */
export const authorizersService = {
  /**
   * ⚠️ The list is the **bare** path. `/authorizers/:id` is the detail — it
   * returns one record, or `200` with `data: null` for an unknown id.
   */
  list: () =>
    apiClient<Authorizer[]>({ url: '/stock-out-orders/authorizers', method: 'GET' }),

  /** ⚠️ Returns `200` with `data: null` for an unknown id, not a `404`. */
  get: (id: string) =>
    apiClient<Authorizer | null>({
      url: `/stock-out-orders/authorizers/${id}`,
      method: 'GET',
    }),

  create: (body: AuthorizerRequest) =>
    apiClient<Authorizer>({
      url: '/stock-out-orders/authorizers',
      method: 'POST',
      data: body,
    }),

  update: (id: string, body: AuthorizerRequest) =>
    apiClient<Authorizer>({
      url: `/stock-out-orders/authorizers/${id}`,
      method: 'PUT',
      data: body,
    }),

  /**
   * Toggles `active` ↔ `inactive`.
   *
   * 🔴 **`PATCH`, not `PUT`.** `PUT .../{id}/status` returns `ROUTE_NOT_FOUND`
   * while `PATCH` reaches the handler — the one status endpoint in this API
   * that is not a `PUT`.
   *
   * The body is ignored: `{}`, `{status:'active'}` and no body at all behave
   * identically, so it flips rather than sets. `{}` is sent because a bodyless
   * request with a JSON header is rejected elsewhere in this API.
   */
  toggleStatus: (id: string) =>
    apiClient<Authorizer>({
      url: `/stock-out-orders/authorizers/${id}/status`,
      method: 'PATCH',
      data: {},
    }),

  remove: (id: string) =>
    apiClient<unknown>({
      url: `/stock-out-orders/authorizers/${id}`,
      method: 'DELETE',
    }),
}
