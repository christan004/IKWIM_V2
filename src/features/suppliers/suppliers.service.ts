import { apiClient } from '@/api/axios-instance'
import type { Supplier, SupplierDetail, SupplierRequest, ListResponse } from '@/api/types'

export const suppliersService = {
  /**
   * A flat array. Each row **nests** its `supplierType` as an object, unlike
   * the detail endpoint which returns a flat `supplierTypeId`.
   */
  /**
   * ⚠️ Served a **paginated envelope** earlier today and a bare array since, so
   * the response is typed as either and read with `listRows()`.
   */
  list: () => apiClient<ListResponse<Supplier>>({ url: '/suppliers', method: 'GET' }),

  /** Flat record with `supplierTypeId` and timestamps, no nested type. */
  get: (id: string) => apiClient<SupplierDetail>({ url: `/suppliers/${id}`, method: 'GET' }),

  create: (body: SupplierRequest) =>
    apiClient<SupplierDetail>({ url: '/suppliers', method: 'POST', data: body }),

  update: (id: string, body: SupplierRequest) =>
    apiClient<SupplierDetail>({ url: `/suppliers/${id}`, method: 'PUT', data: body }),

  /**
   * Toggles `active` ↔ `inactive`.
   *
   * Every other status endpoint in this API (users, units, items, supplier
   * types) is a bodyless PUT that flips rather than sets, and rejects an empty
   * body when the `Content-Type` header claims JSON — so the header is stripped
   * here too. Unverified against the live API: confirming it would have mutated
   * data.
   */
  toggleStatus: (id: string) =>
    apiClient<SupplierDetail>({
      url: `/suppliers/status/${id}`,
      method: 'PUT',
      headers: { 'Content-Type': null },
    }),
}
