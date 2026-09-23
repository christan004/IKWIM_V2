import { apiClient } from '@/api/axios-instance'
import type { Site, SiteRequest } from '@/api/types'

export const sitesService = {
  /** Nests a `pumps` array the detail endpoint omits. */
  list: () => apiClient<Site[]>({ url: '/sites', method: 'GET' }),

  get: (id: string) => apiClient<Site>({ url: `/sites/${id}`, method: 'GET' }),

  /** JSON. Only `name` is required; `email` is format-validated when sent. */
  create: (body: SiteRequest) => apiClient<Site>({ url: '/sites', method: 'POST', data: body }),

  update: (id: string, body: SiteRequest) =>
    apiClient<Site>({ url: `/sites/${id}`, method: 'PUT', data: body }),

  /**
   * **Toggles** the status — there is no target state in the path and no body,
   * so the request itself is the change. Calling it twice returns the site to
   * where it started.
   *
   * Bodyless `PUT`, so `Content-Type` must be stripped or Fastify rejects the
   * empty body with `FST_ERR_CTP_EMPTY_JSON_BODY`.
   *
   * Confirmed against the live API: it returned `201` and flipped a real site.
   */
  toggleStatus: (id: string) =>
    apiClient<Site>({
      url: `/sites/status/${id}`,
      method: 'PUT',
      headers: { 'Content-Type': null },
    }),
}
