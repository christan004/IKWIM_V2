import { apiClient } from '@/api/axios-instance'
import type { Client, ClientRequest, ClientUpdateRequest, Paginated } from '@/api/types'

export const clientsService = {
  /**
   * ⚠️ Returns a **paginated envelope**, and lists client **users** — not
   * client organisations. Several rows can share one `clientId`.
   */
  list: () => apiClient<Paginated<Client>>({ url: '/clients', method: 'GET' }),

  get: (id: string) => apiClient<Client>({ url: `/clients/${id}`, method: 'GET' }),

  /**
   * A **discriminated union** on `position` — see `ClientRequest`. A
   * `clientAdmin` carries `clientDetails` and creates the organisation; a
   * `clientUser` carries `clientId` and joins one.
   */
  create: (body: ClientRequest) =>
    apiClient<Client>({ url: '/clients', method: 'POST', data: body }),

  /** A true patch: any subset, so only changed fields are sent. */
  update: (id: string, body: ClientUpdateRequest) =>
    apiClient<Client>({ url: `/clients/${id}`, method: 'PUT', data: body }),

  /**
   * Toggles active ↔ inactive.
   *
   * 🔴 **`PATCH`, not `PUT`** — `PUT .../:id/status` returns `ROUTE_NOT_FOUND`.
   * The third endpoint here to break the `PUT`-for-status convention, after
   * authorizers and company accounts.
   */
  toggleStatus: (id: string) =>
    apiClient<Client>({ url: `/clients/${id}/status`, method: 'PATCH', data: {} }),

  remove: (id: string) => apiClient<unknown>({ url: `/clients/${id}`, method: 'DELETE' }),
}
