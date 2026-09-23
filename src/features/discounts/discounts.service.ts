import { apiClient } from '@/api/axios-instance'
import type { Discount, DiscountRequest, Paginated } from '@/api/types'

export const discountsService = {
  /** Returns a paginated envelope. */
  list: () => apiClient<Paginated<Discount>>({ url: '/discounts', method: 'GET' }),

  get: (id: string) => apiClient<Discount>({ url: `/discounts/${id}`, method: 'GET' }),

  /**
   * A **discriminated union** on `type` — see `DiscountRequest`. A `ranging`
   * body must not carry `clientId`; the API rejects the key outright.
   */
  create: (body: DiscountRequest) =>
    apiClient<Discount>({ url: '/discounts', method: 'POST', data: body }),

  update: (id: string, body: DiscountRequest) =>
    apiClient<Discount>({ url: `/discounts/${id}`, method: 'PUT', data: body }),

  /** Toggles active ↔ inactive. `PATCH`, like the other newer endpoints here. */
  toggleStatus: (id: string) =>
    apiClient<Discount>({ url: `/discounts/${id}/status`, method: 'PATCH', data: {} }),

  remove: (id: string) => apiClient<unknown>({ url: `/discounts/${id}`, method: 'DELETE' }),
}
