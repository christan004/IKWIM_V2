import { apiClient } from '@/api/axios-instance'
import type {
  CentralStockGroup,
  CentralStockRequest,
  ClearanceRequest,
  ReconciliationRequest,
} from '@/api/types'

/**
 * Builds the multipart body.
 *
 * No `Content-Type` is set: axios detects the `FormData` and writes the header
 * with the `boundary=` parameter a hand-written one would omit — see the same
 * note in `cargo.service.ts`.
 */
function toFormData(body: CentralStockRequest): FormData {
  const form = new FormData()
  form.append('t1ValidationId', body.t1ValidationId)
  form.append('itemId', body.itemId)
  form.append('deportId', body.deportId)
  // Two quantities now — `quantity` is gone. See `CentralStockRequest`.
  form.append('ambQuantity', String(body.ambQuantity))
  form.append('quantityAt20C', String(body.quantityAt20C))
  // Every field below is optional. `0` is meaningful for a loss or gain, so
  // these are tested against `undefined` rather than for truthiness.
  if (body.toleranceRate !== undefined) form.append('toleranceRate', String(body.toleranceRate))
  if (body.lossQty !== undefined) form.append('lossQty', String(body.lossQty))
  if (body.gainQty !== undefined) form.append('gainQty', String(body.gainQty))
  // Blank strings are omitted rather than sent — the API accepts them, but an
  // empty reference is not a reference.
  if (body.customOffice) form.append('customOffice', body.customOffice)
  if (body.transitNumbering) form.append('transitNumbering', body.transitNumbering)
  if (body.blRef) form.append('blRef', body.blRef)
  // Named `supportingDocUrl`, as on T1 validation — cargo spells it
  // `supportingDoc`. See `T1ValidationRequest`.
  if (body.supportingDoc) form.append('supportingDocUrl', body.supportingDoc)
  return form
}

export const centralStockService = {
  /**
   * The **only** read: `GET /central-stock/:id` returns `404`, so there is no
   * detail endpoint to fall back on.
   */
  list: () => apiClient<CentralStockGroup[]>({ url: '/central-stock', method: 'GET' }),

  /** **`multipart/form-data`**, like cargo and T1 validation. */
  create: (body: CentralStockRequest) =>
    apiClient<unknown>({ url: '/central-stock', method: 'POST', data: toFormData(body) }),

  /**
   * Adjusts a stock record up or down.
   *
   * 🔴 **The route returns `404 ROUTE_NOT_FOUND`** — it has not shipped. Kept
   * wired so the UI works unchanged once it does; see `ReconciliationRequest`.
   *
   * JSON, not multipart: no document is uploaded.
   */
  reconcile: (body: ReconciliationRequest) =>
    apiClient<unknown>({ url: '/central-stock/reconciliation', method: 'POST', data: body }),

  /**
   * Clears an item's stock through customs.
   *
   * **`multipart/form-data`**, not JSON — both document fields take real file
   * uploads despite the documented body naming them `…Url`. Optional fields are
   * omitted rather than sent empty, since each is validated when present.
   */
  clear: (body: ClearanceRequest) => {
    const form = new FormData()
    // Newly required, and the discriminant: `manual` also carries the receipt
    // to clear, `fifo` lets the API choose. See `ClearanceRequest`.
    form.append('type', body.type)
    if (body.type === 'manual') form.append('centralStockId', body.centralStockId)
    form.append('itemId', body.itemId)
    form.append('quantity', String(body.quantity))
    if (body.fees !== undefined) form.append('fees', String(body.fees))
    if (body.amount !== undefined) form.append('amount', String(body.amount))
    // Validated when present — an empty string would fail the UUID check.
    if (body.agentId) form.append('agentId', body.agentId)
    // Named `…Url` on the API though it carries a file, as on T1 validation.
    if (body.dmsDoc) form.append('dmsDocUrl', body.dmsDoc)
    return apiClient<unknown>({ url: '/central-stock/clearance', method: 'POST', data: form })
  },
}
