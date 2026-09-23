import { apiClient } from '@/api/axios-instance'
import type { Display, DisplayRequest } from '@/api/types'

export const displaysService = {
  /** Nests the full `pump` **and** carries `status` — unlike the pumps list. */
  list: () => apiClient<Display[]>({ url: '/displays', method: 'GET' }),

  /** The only source of the flat `pumpId` the edit form binds to. */
  get: (id: string) => apiClient<Display>({ url: `/displays/${id}`, method: 'GET' }),

  /** JSON. `name`, `code` and `pumpId` are all required. */
  create: (body: DisplayRequest) =>
    apiClient<Display>({ url: '/displays', method: 'POST', data: body }),

  update: (id: string, body: DisplayRequest) =>
    apiClient<Display>({ url: `/displays/${id}`, method: 'PUT', data: body }),

  /**
   * **Toggles** the status, like sites and pumps — no target state in the path
   * and no body, so the request itself is the change.
   *
   * Bodyless `PUT`, so `Content-Type` must be stripped or Fastify rejects the
   * empty body with `FST_ERR_CTP_EMPTY_JSON_BODY`.
   */
  toggleStatus: (id: string) =>
    apiClient<Display>({
      url: `/displays/status/${id}`,
      method: 'PUT',
      headers: { 'Content-Type': null },
    }),
}
