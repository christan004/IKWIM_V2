import { apiClient } from '@/api/axios-instance'
import type { Driver, DriverRequest, ListResponse } from '@/api/types'

export const driversService = {
  /**
   * A flat array. **Omits `transporterId`** — only the detail endpoint returns
   * it, which is why the edit form fetches rather than seeding from a row.
   */
  /**
   * ⚠️ Returns a **paginated envelope** today, but has served a bare array
   * before — so the response is typed as either and read with `listRows()`.
   */
  list: () => apiClient<ListResponse<Driver>>({ url: '/drivers', method: 'GET' }),

  /** Adds `transporterId` and timestamps that the list omits. */
  get: (id: string) => apiClient<Driver>({ url: `/drivers/${id}`, method: 'GET' }),

  create: (body: DriverRequest) =>
    apiClient<Driver>({ url: '/drivers', method: 'POST', data: body }),

  update: (id: string, body: DriverRequest) =>
    apiClient<Driver>({ url: `/drivers/${id}`, method: 'PUT', data: body }),

  /**
   * Assigns a vehicle to a driver.
   *
   * ⚠️ **The vehicle id comes first**, then the driver — confirmed with the
   * user, not derivable from the API: every combination tried returns
   * `409 RELATION_CONFLICT`, including two nonexistent ids, so the error does
   * not reveal which side failed.
   *
   * Bodyless `PUT`, so `Content-Type` is stripped as with the status routes.
   */
  assignVehicle: (vehicleId: string, driverId: string) =>
    apiClient<Driver>({
      url: `/drivers/assign/${vehicleId}/${driverId}`,
      method: 'PUT',
      headers: { 'Content-Type': null },
    }),

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
    apiClient<Driver>({
      url: `/drivers/status/${id}`,
      method: 'PUT',
      headers: { 'Content-Type': null },
    }),
}
