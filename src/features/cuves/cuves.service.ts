import { apiClient } from '@/api/axios-instance'
import type { Cuve, CuveRequest } from '@/api/types'

export const cuvesService = {
  /** Nests `item` and `site`; the detail returns their flat ids instead. */
  list: () => apiClient<Cuve[]>({ url: '/cuves', method: 'GET' }),

  /** The only source of `itemId`/`siteId`, which the edit form binds to. */
  get: (id: string) => apiClient<Cuve>({ url: `/cuves/${id}`, method: 'GET' }),

  /** JSON. All six fields required — `deadStock` included. */
  create: (body: CuveRequest) => apiClient<Cuve>({ url: '/cuves', method: 'POST', data: body }),

  update: (id: string, body: CuveRequest) =>
    apiClient<Cuve>({ url: `/cuves/${id}`, method: 'PUT', data: body }),

  /**
   * **Toggles** the status, like sites, pumps and displays — no target state in
   * the path and no body, so the request itself is the change.
   *
   * Bodyless `PUT`, so `Content-Type` must be stripped or Fastify rejects the
   * empty body with `FST_ERR_CTP_EMPTY_JSON_BODY`.
   */
  toggleStatus: (id: string) =>
    apiClient<Cuve>({
      url: `/cuves/status/${id}`,
      method: 'PUT',
      headers: { 'Content-Type': null },
    }),
}
