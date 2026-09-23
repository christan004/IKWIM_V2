import { apiClient } from '@/api/axios-instance'
import type { Unit, UnitRequest } from '@/api/types'

export const unitsService = {
  /** A flat array — this endpoint is not paginated, unlike /users and /roles. */
  list: () => apiClient<Unit[]>({ url: '/items/units', method: 'GET' }),

  create: (unit: UnitRequest) =>
    apiClient<Unit>({ url: '/items/units', method: 'POST', data: unit }),

  /**
   * Replaces a unit's name and code. Must be **PUT** with the id in the path —
   * `PATCH` and `/items/units/update/:id` both 404.
   */
  update: (id: string, unit: UnitRequest) =>
    apiClient<Unit>({ url: `/items/units/${id}`, method: 'PUT', data: unit }),

  /**
   * Toggles a unit between `active` and `inactive`. Like the user status
   * endpoint, it **flips** rather than sets — there is no way to request a
   * specific state, so a duplicate call silently undoes the first.
   *
   * `Content-Type` is stripped deliberately: the request has no body, and
   * Fastify rejects an empty body with 400 FST_ERR_CTP_EMPTY_JSON_BODY when the
   * header claims JSON. Axios sets that header by default.
   */
  toggleStatus: (id: string) =>
    apiClient<Unit>({
      url: `/items/units/status/${id}`,
      method: 'PUT',
      headers: { 'Content-Type': null },
    }),
}
