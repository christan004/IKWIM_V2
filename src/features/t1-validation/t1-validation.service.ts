import { apiClient } from '@/api/axios-instance'
import type { T1Status, T1Validation, T1ValidationRequest } from '@/api/types'

/**
 * Builds the multipart body.
 *
 * No `Content-Type` is set anywhere in this file: axios detects the `FormData`
 * and writes the header itself *including the `boundary=` parameter*, which a
 * hand-written header would omit — see the same note in `cargo.service.ts`.
 */
function toFormData(body: T1ValidationRequest): FormData {
  const form = new FormData()
  form.append('nominationId', body.nominationId)
  form.append('exportingCountry', body.exportingCountry)
  form.append('customOffice', body.customOffice)
  form.append('transitNumbering', body.transitNumbering)
  // The field name matches the working request this was built from — cargo
  // spells the same thing `supportingDoc`. See `T1ValidationRequest`.
  if (body.supportingDoc) form.append('supportingDocUrl', body.supportingDoc)
  return form
}

export const t1ValidationService = {
  /** Nests `nomination` and `extraValidations`; the detail returns neither. */
  list: () => apiClient<T1Validation[]>({ url: '/t1-validation', method: 'GET' }),

  /**
   * Only validations whose customs checks have **cleared**.
   *
   * Central stock is received against a T1, and stock should not be recorded
   * against transit that has not been confirmed — so its picker reads this
   * rather than the full list.
   *
   * ⚠️ **Its filtering has been observed to disagree with the full list.** In
   * one session it returned a record while `GET /t1-validation` returned none;
   * later the two swapped, with the full list showing a `confirmed` check while
   * this returned `[]` across six consecutive samples. The endpoint's shape is
   * correct and matches the list, so the client reads it as intended — but an
   * empty picker is worth checking against `/t1-validation` before assuming
   * nothing is confirmed.
   */
  listConfirmed: () =>
    apiClient<T1Validation[]>({
      url: '/t1-validation/confirmed/validations',
      method: 'GET',
    }),

  get: (id: string) => apiClient<T1Validation>({ url: `/t1-validation/${id}`, method: 'GET' }),

  /**
   * **`multipart/form-data`** — like cargo, unlike everything else in this API.
   *
   * `customOffice` and `transitNumbering` are required here but seed the first
   * `extraValidations` entry rather than the parent record.
   */
  create: (body: T1ValidationRequest) =>
    apiClient<T1Validation>({ url: '/t1-validation', method: 'POST', data: toFormData(body) }),

  /**
   * **Sets** the status of an *extra validation*, not of the parent — the id in
   * the path is the child's. Valid values are `pending`, `confirmed` and
   * `cancelled`; anything else returns a validation error naming all three.
   * `PUT` only.
   */
  setStatus: (extraValidationId: string, status: T1Status) =>
    apiClient<T1Validation>({
      url: `/t1-validation/status/${extraValidationId}/${status}`,
      method: 'PUT',
      headers: { 'Content-Type': null },
    }),
}
