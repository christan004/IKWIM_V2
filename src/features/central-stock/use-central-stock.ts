import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { centralStockService } from '@/features/central-stock/central-stock.service'
import { invalidate } from '@/api/query-keys'
import type {
  CentralStockRequest,
  ClearanceRequest,
  ReconciliationRequest,
} from '@/api/types'

export const centralStockQueryKey = ['central-stock'] as const

export function useCentralStock({ enabled = true }: { enabled?: boolean } = {}) {
  const query = useQuery({
    queryKey: centralStockQueryKey,
    queryFn: centralStockService.list,
    staleTime: 60_000,
    // Skipped when the caller lacks read permission, so the UI never fires a
    // request the API would reject.
    enabled,
  })

  return {
    /** One entry per item, each with a `summary` and its own `stocks`. */
    groups: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
  }
}

export function useCreateCentralStock() {
  const queryClient = useQueryClient()

  return useMutation({
    // Create only — the API exposes no update, delete or status endpoint.
    mutationFn: (body: CentralStockRequest) => centralStockService.create(body),
    // Raised from a confirmed T1, and it advances the nomination's timeline to
    // `stockReceived` — so both are stale afterwards.
    onSuccess: () => invalidate(queryClient, 'centralStock'),
  })
}

/**
 * Adjusts a central stock record up or down.
 *
 * 🔴 The endpoint has not shipped — see `central-stock.service.ts`. The UI
 * surfaces the resulting `404` like any other API error rather than pretending
 * the action succeeded.
 */
export function useReconcileCentralStock() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (body: ReconciliationRequest) => centralStockService.reconcile(body),
    // A reconciliation moves `reconciledQuantity` and `remainingQuantity`, and
    // adds a transaction to the clearance ledger.
    onSuccess: () => invalidate(queryClient, 'centralStock'),
  })
}

/**
 * Clears an item's stock through customs.
 *
 * Clearance is raised **per item**, not per receipt — the API pools the item's
 * uncleared stock and refuses anything above it.
 */
export function useClearCentralStock() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (body: ClearanceRequest) => centralStockService.clear(body),
    // Moves `clearedQuantity` / `unclearedQuantity` and adds a clearance to the
    // item's ledger.
    onSuccess: () => invalidate(queryClient, 'centralStock'),
  })
}
