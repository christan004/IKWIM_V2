import { apiClient } from '@/api/axios-instance'
import type { Deport, DeportRequest } from '@/api/types'

export const deportsService = {
  list: () => apiClient<Deport[]>({ url: '/deports', method: 'GET' }),

  get: (id: string) => apiClient<Deport>({ url: `/deports/${id}`, method: 'GET' }),

  create: (body: DeportRequest) =>
    apiClient<Deport>({ url: '/deports', method: 'POST', data: body }),

  update: (id: string, body: DeportRequest) =>
    apiClient<Deport>({ url: `/deports/${id}`, method: 'PUT', data: body }),

  /**
   * Toggles `active` ↔ `inactive`.
   *
   * Follows the same contract as the other status endpoints in this API —
   * bodyless `PUT`, which means `Content-Type` must be stripped or Fastify
   * rejects the empty body with 400 FST_ERR_CTP_EMPTY_JSON_BODY.
   *
   * ⚠️ Unverified: the API was returning 502 throughout this feature's
   * development, so neither the method nor the toggle semantics were confirmed
   * against a live response.
   */
  toggleStatus: (id: string) =>
    apiClient<Deport>({
      url: `/deports/status/${id}`,
      method: 'PUT',
      headers: { 'Content-Type': null },
    }),
}
