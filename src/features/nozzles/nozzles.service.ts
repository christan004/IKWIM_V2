import { apiClient } from '@/api/axios-instance'
import type { Nozzle, NozzleRequest } from '@/api/types'

export const nozzlesService = {
  /** Nests `pump`, `display` and `cuve`; the detail returns their flat ids. */
  list: () => apiClient<Nozzle[]>({ url: '/nozzles', method: 'GET' }),

  /** The only source of the three ids the edit form binds to. */
  get: (id: string) => apiClient<Nozzle>({ url: `/nozzles/${id}`, method: 'GET' }),

  /** JSON. All five fields required. */
  create: (body: NozzleRequest) =>
    apiClient<Nozzle>({ url: '/nozzles', method: 'POST', data: body }),

  update: (id: string, body: NozzleRequest) =>
    apiClient<Nozzle>({ url: `/nozzles/${id}`, method: 'PUT', data: body }),

  /**
   * **Toggles** the status, like everything else under PSS — no target state in
   * the path and no body, so the request itself is the change.
   *
   * Bodyless `PUT`, so `Content-Type` must be stripped or Fastify rejects the
   * empty body with `FST_ERR_CTP_EMPTY_JSON_BODY`.
   */
  toggleStatus: (id: string) =>
    apiClient<Nozzle>({
      url: `/nozzles/status/${id}`,
      method: 'PUT',
      headers: { 'Content-Type': null },
    }),
}
