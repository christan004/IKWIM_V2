import { apiClient } from '@/api/axios-instance'
import type { CargoInvoice, CargoInvoiceRequest } from '@/api/types'

/**
 * Builds the multipart body.
 *
 * Every value goes in as a string — that is all multipart carries — and the
 * server parses the numbers back out. No `Content-Type` is set: axios detects
 * the `FormData` and writes the header itself **including the `boundary=`
 * parameter**, which a hand-written header would omit and the server could not
 * parse. Same note as `cargo.service.ts`.
 */
function toFormData(body: CargoInvoiceRequest): FormData {
  const form = new FormData()
  form.append('cargoId', body.cargoId)
  form.append('quantity', String(body.quantity))
  form.append('unitPrice', String(body.unitPrice))
  form.append('amount', String(body.amount))
  form.append('currencyCode', body.currencyCode)
  form.append('invoiceCode', body.invoiceCode)
  form.append('invoiceReference', body.invoiceReference)
  // Named `supportingDocUrl` though it carries a file — see the type. Omitted
  // entirely when nothing was chosen, rather than sent empty.
  if (body.supportingDoc) form.append('supportingDocUrl', body.supportingDoc)
  return form
}

export const cargoInvoicesService = {
  /**
   * ⚠️ **There is no list-all route.** `GET /cargo-invoices` returns
   * `404 ROUTE_NOT_FOUND`; only `GET /cargo-invoices/{cargoId}` is routed, and
   * it returns the invoices **for that one cargo** as a bare array.
   *
   * So the page lists per cargo rather than globally — see the page for how the
   * shipment is chosen.
   *
   * 🔴 The path id is validated as a UUID while cargo ids are cuids, so this
   * currently returns `400` for every real cargo. See `CargoInvoice`.
   */
  listByCargo: (cargoId: string) =>
    apiClient<CargoInvoice[]>({ url: `/cargo-invoices/${cargoId}`, method: 'GET' }),

  /** **Multipart**, so a document can be attached — see `CargoInvoiceRequest`. */
  create: (body: CargoInvoiceRequest) =>
    apiClient<CargoInvoice>({
      url: '/cargo-invoices',
      method: 'POST',
      data: toFormData(body),
    }),

  /**
   * Also multipart — see `create`.
   *
   * `PUT` only — `PATCH` is not routed (`404 ROUTE_NOT_FOUND`). Takes the same
   * full body as `create`; a partial body is not accepted.
   */
  update: (id: string, body: CargoInvoiceRequest) =>
    apiClient<CargoInvoice>({
      url: `/cargo-invoices/${id}`,
      method: 'PUT',
      data: toFormData(body),
    }),

  /** The id here is the **invoice's**, not the cargo's. */
  remove: (id: string) =>
    apiClient<unknown>({ url: `/cargo-invoices/${id}`, method: 'DELETE' }),
}
