import { apiClient } from '@/api/axios-instance'
import type { Cargo, CargoRequest, CargoStatus } from '@/api/types'

/**
 * Builds the `multipart/form-data` body.
 *
 * Every value goes in as a string — that is all multipart carries — and the
 * server parses the numbers and dates back out. Optional fields are omitted
 * rather than sent empty, and the file is only appended when one was chosen.
 */
function toFormData(body: CargoRequest): FormData {
  const form = new FormData()
  form.append('orderId', body.orderId)
  form.append('deportId', body.deportId)
  form.append('vesselName', body.vesselName)
  form.append('receivedDate', body.receivedDate)
  form.append('expirationDate', body.expirationDate)
  // Two quantities now — `quantity` is gone. See `CargoRequest`.
  form.append('ambQuantity', String(body.ambQuantity))
  form.append('quantityAt20C', String(body.quantityAt20C))
  form.append('blRef', body.blRef)
  if (body.tansisRef) form.append('tansisRef', body.tansisRef)
  if (body.outurnRef) form.append('outurnRef', body.outurnRef)
  /*
   * ⚠️ Named `supportingDocUrl`, matching central stock and T1 validation —
   * only cargo used to spell it `supportingDoc`. Both names pass validation, so
   * this follows the documented field rather than the older guess.
   */
  if (body.supportingDoc) form.append('supportingDocUrl', body.supportingDoc)
  return form
}

export const cargoService = {
  /**
   * A flat array. Nests an `order` object, but carries **no deport reference**
   * — so a row alone cannot seed the edit form.
   */
  list: () => apiClient<Cargo[]>({ url: '/cargo', method: 'GET' }),

  /** Returns flat `orderId` and `deportId`, plus timestamps, and no nested `order`. */
  get: (id: string) => apiClient<Cargo>({ url: `/cargo/${id}`, method: 'GET' }),

  /**
   * ⚠️ **Multipart, not JSON.** A JSON body is rejected outright with
   * `406 FST_INVALID_MULTIPART_CONTENT_TYPE`.
   *
   * No `Content-Type` is set here on purpose: axios detects the `FormData` and
   * writes the header itself **including the `boundary=` parameter**, which a
   * hand-written header would omit and the server could not parse. Verified.
   */
  create: (body: CargoRequest) =>
    apiClient<Cargo>({ url: '/cargo', method: 'POST', data: toFormData(body) }),

  /** Also multipart — see `create`. */
  update: (id: string, body: CargoRequest) =>
    apiClient<Cargo>({ url: `/cargo/${id}`, method: 'PUT', data: toFormData(body) }),

  /**
   * **Sets** the status; the target state goes in the path, like order plans
   * rather than the bodyless toggles. Valid values are `pending`, `approved`
   * and `cancelled` — anything else returns a validation error naming all three.
   *
   * The path carries a **third segment**: the date the decision was taken. It is
   * required — omitting it gives `ROUTE_NOT_FOUND`, not a validation error — and
   * is validated as a date under the field name `date`. `PUT` only; `PATCH` and
   * `POST` are not routed.
   *
   * Defaults to now, which is what recording a decision means. It is a full ISO
   * instant rather than a calendar day: unlike `receivedDate` this is a moment in
   * time, so the usual UTC-day slicing does not apply.
   */
  setStatus: (id: string, status: CargoStatus, date: string = new Date().toISOString()) =>
    apiClient<Cargo>({
      url: `/cargo/status/${id}/${status}/${date}`,
      method: 'PUT',
      headers: { 'Content-Type': null },
    }),
}
