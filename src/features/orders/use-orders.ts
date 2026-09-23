import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ordersService } from '@/features/orders/orders.service'
import { invalidate } from '@/api/query-keys'
import type { OrderRequest } from '@/api/types'

export const ordersQueryKey = ['orders'] as const

export interface OrderFilter {
  supplierId?: string
  planId?: string
}

/**
 * Orders, optionally narrowed by supplier or plan.
 *
 * The filtered endpoint 404s when given no parameters, so an empty filter falls
 * back to the plain list rather than sending a request that cannot succeed.
 */
export function useOrders({
  filter = {},
  enabled = true,
}: { filter?: OrderFilter; enabled?: boolean } = {}) {
  const supplierId = filter.supplierId || undefined
  const planId = filter.planId || undefined
  const isFiltered = Boolean(supplierId || planId)

  const query = useQuery({
    queryKey: [...ordersQueryKey, { supplierId, planId }],
    queryFn: () =>
      isFiltered ? ordersService.listBy({ supplierId, planId }) : ordersService.list(),
    staleTime: 60_000,
    // Skipped when the caller lacks read permission, so the UI never fires a
    // request the API would reject.
    enabled,
  })

  return {
    orders: query.data ?? [],
    isFiltered,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    isError: query.isError,
    error: query.error,
  }
}

/**
 * Fetches one order's flat record, which carries the foreign keys the list
 * omits. This is what seeds the edit form.
 *
 * The key is nested under `ordersQueryKey`, so saving invalidates both this and
 * every filtered list in one call.
 */
export function useOrder(id: string | undefined) {
  const query = useQuery({
    queryKey: [...ordersQueryKey, id],
    queryFn: () => ordersService.get(id!),
    enabled: Boolean(id),
    staleTime: 60_000,
  })

  return {
    order: query.data ?? null,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
  }
}

export function useSaveOrder() {
  const queryClient = useQueryClient()

  return useMutation({
    // One mutation for both paths: an id means update, its absence means create.
    mutationFn: ({ id, ...body }: OrderRequest & { id?: string }) =>
      id ? ordersService.update(id, body) : ordersService.create(body),
    // Cargo rows embed their order and its quantity, so the cargo list — and
    // the remaining-stock figure the cargo form validates against — follow.
    onSuccess: () => invalidate(queryClient, 'orders'),
  })
}
