import { apiClient } from '@/api/axios-instance'
import type { Order, OrderDetail, OrderRequest } from '@/api/types'

/**
 * Routes confirmed by probing the live API:
 *
 *   GET  /orders                        list all
 *   GET  /orders/by-supplier-or-plan    filtered list
 *   POST /orders                        create
 *   GET  /orders/:id                    one order
 *   PUT  /orders/:id                    update
 *
 * `PATCH` and `DELETE` on `/orders/:id` both 404.
 */
export const ordersService = {
  /** Every order, newest first is not guaranteed — the API returns them unsorted. */
  list: () => apiClient<Order[]>({ url: '/orders', method: 'GET' }),

  /**
   * Filtered list. **The parameter names are `supplierId` and `planId`** —
   * `orderPlanId` (the name used when creating an order) returns 404 here.
   * Passing neither also 404s, so a filter must always be supplied.
   */
  listBy: (filter: { supplierId?: string; planId?: string }) =>
    apiClient<Order[]>({
      url: '/orders/by-supplier-or-plan',
      method: 'GET',
      params: filter,
    }),

  /**
   * A flat record carrying `supplierId`, `itemId`, and `orderPlanId` — the
   * foreign keys the list omits, and the only way to seed the edit form.
   *
   * Returns `data: null` for an id that no longer exists rather than 404, so
   * callers must check for null instead of relying on a thrown error.
   */
  get: (id: string) =>
    apiClient<OrderDetail | null>({ url: `/orders/${id}`, method: 'GET' }),

  /**
   * Required: `supplierId`, `orderDate`, `itemId`, `orderPlanId`, `quantity`.
   *
   * `createdByUserId` is **not** accepted — the API derives the creator from
   * the access token, so sending it is unnecessary.
   */
  create: (body: OrderRequest) =>
    apiClient<Order>({ url: '/orders', method: 'POST', data: body }),

  update: (id: string, body: OrderRequest) =>
    apiClient<Order>({ url: `/orders/${id}`, method: 'PUT', data: body }),
}
