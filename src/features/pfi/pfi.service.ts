import { apiClient } from '@/api/axios-instance'
import type { Currency, CurrencyRequest, Pfi, PfiFilter, PfiRequest } from '@/api/types'

/**
 * Builds the multipart body.
 *
 * No `Content-Type` is set: axios detects the `FormData` and writes the header
 * with the `boundary=` parameter a hand-written one would omit — the same note
 * as `cargo.service.ts`.
 *
 * ⚠️ Sent as multipart **only so a document can be attached**. The endpoint
 * accepts JSON too, but a file cannot travel that way.
 */
function toFormData(body: PfiRequest): FormData {
  const form = new FormData()
  form.append('nominationId', body.nominationId)
  form.append('currencyId', body.currencyId)
  form.append('currancyCode', body.currancyCode)
  form.append('pfiReference', body.pfiReference)
  form.append('amount', String(body.amount))
  form.append('unitPrice', String(body.unitPrice))
  // Optional — omitted rather than sent empty.
  if (body.rate !== undefined) form.append('rate', String(body.rate))
  /*
   * ⚠️ The field is `supportingDocUrl` even though it carries a file, matching
   * cargo, central stock and T1 validation.
   */
  if (body.supportingDoc) form.append('supportingDocUrl', body.supportingDoc)
  return form
}

export const pfiService = {
  /** Nests `currency`; carries no `currencyId`. See `Pfi`. */
  list: (filter: PfiFilter = {}) => {
    // Both dates are validated when present, so blank values are stripped
    // rather than sent — `startDate=` returns 400, not "no filter".
    const params = Object.fromEntries(
      Object.entries(filter).filter(([, value]) => value !== undefined && value !== ''),
    )
    return apiClient<Pfi[]>({ url: '/pfi', method: 'GET', params })
  },

  /** Returns a flat `currencyId` and no nested `currency` — the reverse of the list. */
  get: (id: string) => apiClient<Pfi>({ url: `/pfi/${id}`, method: 'GET' }),

  /**
   * **`multipart/form-data`**, so a supporting document can be attached.
   *
   * Required: `nominationId`, `currencyId`, `currancyCode`, `pfiReference`,
   * `amount` **and** `unitPrice` — see `PfiRequest`. `pifCode` is
   * server-generated and never sent.
   */
  create: (body: PfiRequest) =>
    apiClient<Pfi>({ url: '/pfi', method: 'POST', data: toFormData(body) }),

  update: (id: string, body: PfiRequest) =>
    apiClient<Pfi>({ url: `/pfi/${id}`, method: 'PUT', data: toFormData(body) }),
}

/**
 * Currencies live under `/pfi/currency` and share the `pfi.*` permissions —
 * the backend exposes no separate currency module.
 *
 * Only list, create and update exist: there is no GET-by-id, `PATCH` or
 * `DELETE`.
 */
export const currencyService = {
  list: () => apiClient<Currency[]>({ url: '/pfi/currency', method: 'GET' }),

  create: (body: CurrencyRequest) =>
    apiClient<Currency>({ url: '/pfi/currency', method: 'POST', data: body }),

  update: (id: string, body: CurrencyRequest) =>
    apiClient<Currency>({ url: `/pfi/currency/${id}`, method: 'PUT', data: body }),
}
