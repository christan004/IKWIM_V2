import { apiClient } from '@/api/axios-instance'
import type { OrderPlan, OrderPlanRequest, OrderPlanStatus } from '@/api/types'

export const orderPlansService = {
  /** A flat array of `{ id, name, status }` — no dates, no pagination. */
  list: () => apiClient<OrderPlan[]>({ url: '/orders/order-plan', method: 'GET' }),

  /** Returns the same three fields as the list; no extra detail. */
  get: (id: string) =>
    apiClient<OrderPlan>({ url: `/orders/order-plan/${id}`, method: 'GET' }),

  create: (body: OrderPlanRequest) =>
    apiClient<OrderPlan>({ url: '/orders/order-plan', method: 'POST', data: body }),

  update: (id: string, body: OrderPlanRequest) =>
    apiClient<OrderPlan>({ url: `/orders/order-plan/${id}`, method: 'PUT', data: body }),

  /**
   * Sets the plan's status. **Unlike every other status endpoint in this API**,
   * the target state goes in the path rather than being toggled — so it is a
   * `set`, not a flip, and there are four possible values.
   *
   * Must be `PUT`; `PATCH` and `POST` both 404. No body, so `Content-Type` is
   * stripped to avoid Fastify's empty-body rejection.
   */
  setStatus: (id: string, status: OrderPlanStatus) =>
    apiClient<OrderPlan>({
      url: `/orders/order-plan/status/${id}/${status}`,
      method: 'PUT',
      headers: { 'Content-Type': null },
    }),
}
