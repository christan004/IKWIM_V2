import { apiClient } from '@/api/axios-instance'
import type { Transporter, TransporterRequest } from '@/api/types'

export const transportersService = {
  /** A flat array. The detail endpoint adds `updatedAt`; otherwise identical. */
  list: () => apiClient<Transporter[]>({ url: '/transporters', method: 'GET' }),

  get: (id: string) =>
    apiClient<Transporter>({ url: `/transporters/${id}`, method: 'GET' }),

  create: (body: TransporterRequest) =>
    apiClient<Transporter>({ url: '/transporters', method: 'POST', data: body }),

  update: (id: string, body: TransporterRequest) =>
    apiClient<Transporter>({ url: `/transporters/${id}`, method: 'PUT', data: body }),

  /**
   * Toggles `active` ↔ `inactive`.
   *
   * Follows the same contract as the other status endpoints in this API —
   * bodyless `PUT`, so `Content-Type` must be stripped or Fastify rejects the
   * empty body with 400 FST_ERR_CTP_EMPTY_JSON_BODY.
   *
   * ⚠️ Unverified: confirming it would have mutated data.
   */
  toggleStatus: (id: string) =>
    apiClient<Transporter>({
      url: `/transporters/status/${id}`,
      method: 'PUT',
      headers: { 'Content-Type': null },
    }),
}
