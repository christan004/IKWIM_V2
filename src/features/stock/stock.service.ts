import { apiClient } from '@/api/axios-instance'
import type { Stock, StockFilter, StockGroup, StockStatus } from '@/api/types'

/**
 * The floor used when a caller asks for all stock. Far enough back to predate
 * any record, so it filters nothing out — it exists only to satisfy the
 * `startDate` the API wrongly insists on. Matches the nominations service.
 */
const EPOCH_START = '2000-01-01T00:00:00.000Z'

/**
 * Stock is **read-only** here: records come from the cargo flow, so this
 * console lists them and moves them between statuses but never creates or
 * edits one. The create/update endpoints exist on the API and are deliberately
 * not surfaced.
 */
export const stockService = {
  /**
   * Returns one entry **per item**, each holding its own `stocks` array.
   *
   * Every filter is validated when present, so blank values are stripped rather
   * than sent — `status=` returns `400`, not "no filter".
   */
  list: (filter: StockFilter = {}) => {
    const params = Object.fromEntries(
      Object.entries(filter).filter(([, value]) => value !== undefined && value !== ''),
    )
    // 🔴 Backend defect, see `StockFilter`: without a `startDate` the list comes
    // back empty however much stock exists. Applied here rather than in each
    // caller so a picker that wants "all of it" cannot silently get none — the
    // stock page passes its own dates and keeps them.
    if (params.startDate === undefined) params.startDate = EPOCH_START
    return apiClient<StockGroup[]>({ url: '/stock', method: 'GET', params })
  },

  get: (id: string) => apiClient<Stock>({ url: `/stock/${id}`, method: 'GET' }),

  /**
   * **Sets** the status; the target state goes in the path, like order plans
   * rather than the bodyless toggles. Valid values are `awaiting`, `received`,
   * `returned` and `cancelled` — anything else returns a validation error
   * naming all four.
   */
  setStatus: (id: string, status: StockStatus) =>
    apiClient<Stock>({
      url: `/stock/status/${id}/${status}`,
      method: 'PUT',
      headers: { 'Content-Type': null },
    }),
}
