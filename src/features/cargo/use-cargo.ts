import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { cargoService } from '@/features/cargo/cargo.service'
import { invalidate } from '@/api/query-keys'
import type { CargoRequest, CargoStatus } from '@/api/types'

export const cargoQueryKey = ['cargo'] as const

export function useCargoList({ enabled = true }: { enabled?: boolean } = {}) {
  const query = useQuery({
    queryKey: cargoQueryKey,
    queryFn: cargoService.list,
    staleTime: 60_000,
    // Skipped when the caller lacks read permission, so the UI never fires a
    // request the API would reject.
    enabled,
  })

  return {
    cargo: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
  }
}

/**
 * Fetches one cargo record, the only source of its `orderId` — the list omits
 * that field. The key nests under `cargoQueryKey`, so saving invalidates both
 * this and the list in one call.
 */
export function useCargo(id: string | undefined) {
  const query = useQuery({
    queryKey: [...cargoQueryKey, id],
    queryFn: () => cargoService.get(id!),
    enabled: Boolean(id),
    staleTime: 60_000,
  })

  return { cargo: query.data ?? null, isLoading: query.isLoading }
}

export function useSaveCargo() {
  const queryClient = useQueryClient()

  return useMutation({
    // One mutation for both paths: an id means update, its absence means create.
    mutationFn: ({ id, ...body }: CargoRequest & { id?: string }) =>
      id ? cargoService.update(id, body) : cargoService.create(body),
    // Orders carry `stockCargos`, `remainingStock` and `cargos[]`, all derived
    // from cargo — so the order list is stale the moment cargo changes.
    onSuccess: (_data, variables) =>
      invalidate(queryClient, 'cargo', variables.id ? [[...cargoQueryKey, variables.id]] : []),
  })
}

export function useSetCargoStatus() {
  const queryClient = useQueryClient()

  return useMutation({
    // `date` is when the decision was taken; the service defaults it to now,
    // which is what the UI wants. It stays overridable for a backdated one.
    mutationFn: ({ id, status, date }: { id: string; status: CargoStatus; date?: string }) =>
      cargoService.setStatus(id, status, date),
    // Approving raises stock against the shipment and cancelling withdraws it,
    // so both stock and the order's remaining figure move with the decision.
    onSuccess: (_data, variables) =>
      invalidate(queryClient, 'cargo', [[...cargoQueryKey, variables.id]]),
  })
}
