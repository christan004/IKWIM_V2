import { apiClient } from '@/api/axios-instance'
import type { ListResponse, SupplierType, SupplierTypeRequest } from '@/api/types'

export const supplierTypesService = {
  /** A flat array, like /items/units — not a paginated envelope. */
  /**
   * ⚠️ Returns a **paginated envelope** today, but has served a bare array
   * before — so the response is typed as either and read with `listRows()`.
   */
  list: () =>
    apiClient<ListResponse<SupplierType>>({
      url: '/suppliers/supplier-type',
      method: 'GET',
    }),

  get: (id: string) =>
    apiClient<SupplierType>({ url: `/suppliers/supplier-type/${id}`, method: 'GET' }),

  create: (body: SupplierTypeRequest) =>
    apiClient<SupplierType>({
      url: '/suppliers/supplier-type',
      method: 'POST',
      data: body,
    }),

  update: (id: string, body: SupplierTypeRequest) =>
    apiClient<SupplierType>({
      url: `/suppliers/supplier-type/${id}`,
      method: 'PUT',
      data: body,
    }),

  /**
   * Toggles `active` ↔ `inactive`.
   *
   * Every other status endpoint in this API (users, units, items) is a bodyless
   * PUT that flips rather than sets, and rejects an empty body when the
   * `Content-Type` header claims JSON — so the header is stripped here too.
   * Unverified against the live API: confirming it would have mutated data.
   */
  toggleStatus: (id: string) =>
    apiClient<SupplierType>({
      url: `/suppliers/supplier-type/status/${id}`,
      method: 'PUT',
      headers: { 'Content-Type': null },
    }),
}
