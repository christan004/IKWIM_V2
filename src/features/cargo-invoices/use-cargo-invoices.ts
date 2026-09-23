import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { cargoInvoicesService } from '@/features/cargo-invoices/cargo-invoices.service'
import { invalidate } from '@/api/query-keys'
import { QK } from '@/api/query-keys'
import type { CargoInvoiceRequest } from '@/api/types'

export const cargoInvoicesQueryKey = QK.cargoInvoices

/**
 * The invoices raised against one shipment.
 *
 * 🔴 **Not used by the invoices UI**, which reads `cargo.cargoInvoices[]` off
 * the cargo list instead — `GET /cargo-invoices/{cargoId}` rejects every real
 * cargo id as "Must be a valid UUID" while cargo ids are cuids. Kept because it
 * is the endpoint's own route and will work once the server accepts a cuid;
 * see `CargoInvoice`.
 *
 * There is no list-all route — see the service — so the cargo is part of the
 * key and each shipment caches separately.
 */
export function useCargoInvoices({
  cargoId,
  enabled = true,
}: {
  cargoId: string | undefined
  enabled?: boolean
}) {
  const query = useQuery({
    queryKey: [...cargoInvoicesQueryKey, cargoId],
    queryFn: () => cargoInvoicesService.listByCargo(cargoId!),
    // Nothing to fetch until a shipment is chosen, and skipped outright when the
    // caller lacks read permission.
    enabled: enabled && Boolean(cargoId),
    staleTime: 60_000,
    // Keeps the previous shipment's rows on screen while the next loads.
    placeholderData: (previous) => previous,
  })

  return {
    invoices: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
  }
}

export function useSaveCargoInvoice() {
  const queryClient = useQueryClient()

  return useMutation({
    // One mutation for both paths: an id means update, its absence means create.
    mutationFn: ({ id, ...body }: CargoInvoiceRequest & { id?: string }) =>
      id ? cargoInvoicesService.update(id, body) : cargoInvoicesService.create(body),
    // The shipment's own list is keyed by `cargoId`, so it is refreshed by name
    // alongside the cargo list that embeds `cargoInvoices[]`.
    onSuccess: (_data, variables) =>
      invalidate(queryClient, 'cargoInvoices', [
        [...cargoInvoicesQueryKey, variables.cargoId],
      ]),
  })
}

export function useDeleteCargoInvoice() {
  const queryClient = useQueryClient()

  return useMutation({
    // `cargoId` is not sent — it is carried only so the shipment's cached list
    // can be invalidated by name once the invoice is gone.
    mutationFn: ({ id }: { id: string; cargoId: string }) =>
      cargoInvoicesService.remove(id),
    onSuccess: (_data, variables) =>
      invalidate(queryClient, 'cargoInvoices', [
        [...cargoInvoicesQueryKey, variables.cargoId],
      ]),
  })
}
