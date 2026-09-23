import { apiClient } from '@/api/axios-instance'
import type {
  Nomination,
  NominationFilter,
  NominationRequest,
  NominationTimelineEntry,
} from '@/api/types'

/**
 * The floor used when a caller asks for every nomination. Far enough back to
 * predate any record, so it filters nothing out — it exists only to satisfy the
 * `startDate` the API wrongly insists on.
 */
const EPOCH_START = '2000-01-01T00:00:00.000Z'

export const nominationsService = {
  /**
   * Nests `driverVehicle` but returns **no date** — see `Nomination`. The table
   * renders from here; the edit form reads `get` instead.
   */
  list: (filter: NominationFilter = {}) => {
    // Every filter is validated when present, so blank values are stripped
    // rather than sent — `itemId=` returns 400, not "no filter".
    const params = Object.fromEntries(
      Object.entries(filter).filter(([, value]) => value !== undefined && value !== ''),
    )
    // 🔴 Backend defect, see `NominationFilter`: without a `startDate` the list
    // comes back empty however many nominations exist. Applied here rather than
    // in each caller so a picker that wants "all of them" cannot silently get
    // none — the nominations page passes its own dates and keeps them.
    if (params.startDate === undefined) params.startDate = EPOCH_START
    return apiClient<Nomination[]>({ url: '/nominations', method: 'GET', params })
  },

  /** The only source of `stockId`, `driverVehicleId` and the date. */
  get: (id: string) => apiClient<Nomination>({ url: `/nominations/${id}`, method: 'GET' }),

  /** JSON. All five fields required; note `expectedLoadingedDate`'s spelling. */
  create: (body: NominationRequest) =>
    apiClient<Nomination>({ url: '/nominations', method: 'POST', data: body }),

  update: (id: string, body: NominationRequest) =>
    apiClient<Nomination>({ url: `/nominations/${id}`, method: 'PUT', data: body }),

  /**
   * Progress so far. Only stages **reached** are returned, and an unknown id
   * gives an empty array rather than a `404` — so callers must treat `[]` as
   * "nothing yet", not as a failure.
   */
  timeline: (id: string) =>
    apiClient<NominationTimelineEntry[]>({
      url: `/nominations/time-line/${id}`,
      method: 'GET',
    }),
}
