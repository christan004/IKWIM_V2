import { apiClient } from '@/api/axios-instance'
import type { CompanyAccount, CompanyAccountRequest, Paginated } from '@/api/types'

export const companyAccountsService = {
  /**
   * ⚠️ Returns a **paginated envelope** — `{ items, pagination }` — not a flat
   * array, like `/users` and `/roles`.
   */
  list: () =>
    apiClient<Paginated<CompanyAccount>>({ url: '/company-accounts', method: 'GET' }),

  get: (id: string) =>
    apiClient<CompanyAccount>({ url: `/company-accounts/${id}`, method: 'GET' }),

  create: (body: CompanyAccountRequest) =>
    apiClient<CompanyAccount>({ url: '/company-accounts', method: 'POST', data: body }),

  /** Both fields are required here too — a partial body is rejected. */
  update: (id: string, body: CompanyAccountRequest) =>
    apiClient<CompanyAccount>({ url: `/company-accounts/${id}`, method: 'PUT', data: body }),

  /**
   * Toggles `active` ↔ `inactive`.
   *
   * 🔴 **`PATCH`, not `PUT`** — `PUT .../:id/status` returns `ROUTE_NOT_FOUND`.
   * The second endpoint in this API to break the `PUT`-for-status convention,
   * after stockout authorizers.
   *
   * `{}` is sent rather than no body, as elsewhere.
   */
  toggleStatus: (id: string) =>
    apiClient<CompanyAccount>({
      url: `/company-accounts/${id}/status`,
      method: 'PATCH',
      data: {},
    }),

  // No `remove`: `DELETE /company-accounts/:id` returns `ROUTE_NOT_FOUND` even
  // for a well-formed CUID, so deactivating is the only way to retire one.
}
