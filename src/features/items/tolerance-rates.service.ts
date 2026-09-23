import { apiClient } from '@/api/axios-instance'
import type { ItemToleranceRate, ItemToleranceRateRequest } from '@/api/types'

/**
 * Tolerance rates live under Items rather than in a feature of their own: they
 * are a property of an item, set from the items table, and the API exposes no
 * module or permissions for them separately — `items.*` governs both.
 */
export const toleranceRatesService = {
  /**
   * A bare array. Accepts an `itemId` filter, though the whole list is small
   * enough that the page fetches it once and matches rows client-side.
   */
  list: () =>
    apiClient<ItemToleranceRate[]>({ url: '/item-tolerance-rates', method: 'GET' }),

  /** ⚠️ Keyed by the **rate's** id, not the item's. */
  get: (id: string) =>
    apiClient<ItemToleranceRate>({ url: `/item-tolerance-rates/${id}`, method: 'GET' }),

  create: (body: ItemToleranceRateRequest) =>
    apiClient<ItemToleranceRate>({
      url: '/item-tolerance-rates',
      method: 'POST',
      data: body,
    }),

  /**
   * `PUT` only — `PATCH` is not routed. Takes the same full body as `create`.
   *
   * ⚠️ **There is no delete endpoint** (`DELETE` returns `ROUTE_NOT_FOUND`), so
   * editing is the only correction path — as with items themselves.
   */
  update: (id: string, body: ItemToleranceRateRequest) =>
    apiClient<ItemToleranceRate>({
      url: `/item-tolerance-rates/${id}`,
      method: 'PUT',
      data: body,
    }),
}
