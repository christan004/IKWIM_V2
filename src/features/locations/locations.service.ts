import { apiClient } from '@/api/axios-instance'
import type { Location } from '@/api/types'

export const locationsService = {
  /**
   * The roots — the five provinces. Every row has `parentId: null`.
   */
  list: () => apiClient<Location[]>({ url: '/locations', method: 'GET' }),

  /**
   * One level down from `parentId`.
   *
   * ⚠️ An unknown parent returns `200` with an **empty array**, not a `404`, so
   * a stale id degrades to "no options" rather than an error.
   */
  children: (parentId: string) =>
    apiClient<Location[]>({ url: `/locations/parent/${parentId}`, method: 'GET' }),
}
