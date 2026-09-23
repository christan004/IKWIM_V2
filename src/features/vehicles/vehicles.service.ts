import { apiClient } from '@/api/axios-instance'
import type { Vehicle, VehicleRequest } from '@/api/types'

export const vehiclesService = {
  /**
   * A flat array. Each row nests a `transport` summary **and** keeps the flat
   * `transporterId`, so the edit form can seed itself from a row directly.
   */
  list: () => apiClient<Vehicle[]>({ url: '/vehicles', method: 'GET' }),

  /** Returns timestamps instead of the nested `transport`. */
  get: (id: string) => apiClient<Vehicle>({ url: `/vehicles/${id}`, method: 'GET' }),

  create: (body: VehicleRequest) =>
    apiClient<Vehicle>({ url: '/vehicles', method: 'POST', data: body }),

  update: (id: string, body: VehicleRequest) =>
    apiClient<Vehicle>({ url: `/vehicles/${id}`, method: 'PUT', data: body }),

/**
   * Toggles `active` ↔ `inactive`. **Verified** against the live API: a bodyless
   * `PUT` returns 201 and flips the status.
   *
   * `Content-Type` is stripped because the request has no body, and Fastify
   * rejects an empty body with 400 FST_ERR_CTP_EMPTY_JSON_BODY when the header
   * claims JSON.
   */
  toggleStatus: (id: string) =>
    apiClient<Vehicle>({
      url: `/vehicles/status/${id}`,
      method: 'PUT',
      headers: { 'Content-Type': null },
    }),
}
