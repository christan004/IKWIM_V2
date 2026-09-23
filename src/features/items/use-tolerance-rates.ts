import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toleranceRatesService } from '@/features/items/tolerance-rates.service'
import { invalidate, QK } from '@/api/query-keys'
import type { ItemToleranceRateRequest } from '@/api/types'

export const toleranceRatesQueryKey = QK.itemToleranceRates

/**
 * Every item's tolerance rate.
 *
 * Fetched whole rather than per item: the list is one row per item at most, so
 * one request serves the entire table without a query per row.
 */
export function useToleranceRates({ enabled = true }: { enabled?: boolean } = {}) {
  const query = useQuery({
    queryKey: toleranceRatesQueryKey,
    queryFn: toleranceRatesService.list,
    staleTime: 60_000,
    // Skipped when the caller lacks read permission, so the UI never fires a
    // request the API would reject.
    enabled,
  })

  return {
    rates: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
  }
}

export function useSaveToleranceRate() {
  const queryClient = useQueryClient()

  return useMutation({
    // One mutation for both paths: an id means update, its absence means create.
    // The id is the **rate's**, not the item's.
    mutationFn: ({ id, ...body }: ItemToleranceRateRequest & { id?: string }) =>
      id ? toleranceRatesService.update(id, body) : toleranceRatesService.create(body),
    onSuccess: () => invalidate(queryClient, 'itemToleranceRates'),
  })
}
