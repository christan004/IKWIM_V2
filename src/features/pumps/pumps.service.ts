import { apiClient } from '@/api/axios-instance'
import type { Pump, PumpRequest } from '@/api/types'

export const pumpsService = {
  /** Nests the full `site`; carries no `status` or `siteId`. See `Pump`. */
  list: () => apiClient<Pump[]>({ url: '/pumps', method: 'GET' }),

  /** The only source of `siteId` and `status` — the reverse of the list. */
  get: (id: string) => apiClient<Pump>({ url: `/pumps/${id}`, method: 'GET' }),

  /** JSON. Both `name` and `siteId` are required. */
  create: (body: PumpRequest) => apiClient<Pump>({ url: '/pumps', method: 'POST', data: body }),

  update: (id: string, body: PumpRequest) =>
    apiClient<Pump>({ url: `/pumps/${id}`, method: 'PUT', data: body }),

  /**
   * **Toggles** the status, like sites — no target state in the path and no
   * body, so the request itself is the change and calling it twice returns the
   * pump to where it started.
   *
   * Bodyless `PUT`, so `Content-Type` must be stripped or Fastify rejects the
   * empty body with `FST_ERR_CTP_EMPTY_JSON_BODY`.
   */
  toggleStatus: (id: string) =>
    apiClient<Pump>({
      url: `/pumps/status/${id}`,
      method: 'PUT',
      headers: { 'Content-Type': null },
    }),
}
