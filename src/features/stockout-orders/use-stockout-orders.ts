import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { stockoutOrdersService } from '@/features/stockout-orders/stockout-orders.service'
import { invalidate } from '@/api/query-keys'
import { listRows } from '@/api/types'
import type {
  LoadingOrderRequest,
  ReceptionRequest,
  StockoutOrderFilter,
  StockoutOrderRequest,
  StockoutOrderStatus,
} from '@/api/types'

export const stockoutOrdersQueryKey = ['stock-out-orders'] as const

export function useStockoutOrders({
  enabled = true,
  filter,
}: { enabled?: boolean; filter?: StockoutOrderFilter } = {}) {
  const query = useQuery({
    // The filter is part of the key, so each range caches separately.
    queryKey: [...stockoutOrdersQueryKey, filter ?? {}],
    queryFn: () => stockoutOrdersService.list(filter),
    staleTime: 60_000,
    // Skipped when the caller lacks read permission, so the UI never fires a
    // request the API would reject.
    enabled,
    // Keeps the previous rows on screen while a new range loads.
    placeholderData: (previous) => previous,
  })

  return {
    // The envelope's three parts, each defaulted so a caller never guards.
    orders: query.data?.orders ?? [],
    summary: query.data?.summary ?? null,
    breakdowns: query.data?.breakdowns ?? { items: [], sites: [] },
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
  }
}

export function useCreateStockoutOrder() {
  const queryClient = useQueryClient()

  return useMutation({
    // Create only — the API exposes no update or delete for this resource.
    mutationFn: (body: StockoutOrderRequest) => stockoutOrdersService.create(body),
    // Taking stock out draws down `soldOutQuantity` in central stock and the
    // stock views, so both follow — see the dependency map in `query-keys.ts`.
    onSuccess: () => invalidate(queryClient, 'stockoutOrders'),
  })
}

/**
 * Sets an order's status.
 *
 * The route exists now — an earlier spelling was wrong, which is why this page
 * was read-only. See `stockout-orders.service.ts`.
 */
export function useSetStockoutOrderStatus() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: StockoutOrderStatus }) =>
      stockoutOrdersService.setStatus(id, status),
    // A status change moves the same quantities the creation did.
    onSuccess: () => invalidate(queryClient, 'stockoutOrders'),
  })
}

export const loadingOrdersQueryKey = ['stock-out-orders', 'loading-orders'] as const

export function useLoadingOrders({ enabled = true }: { enabled?: boolean } = {}) {
  const query = useQuery({
    queryKey: loadingOrdersQueryKey,
    queryFn: stockoutOrdersService.loadingOrders,
    staleTime: 60_000,
    enabled,
  })

  return {
    loadingOrders: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
  }
}

export function useCreateLoadingOrder() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (body: LoadingOrderRequest) => stockoutOrdersService.createLoadingOrder(body),
    // Loading an order consumes its unassigned quantity, so the orders list
    // changes with it.
    onSuccess: () => invalidate(queryClient, 'stockoutOrders'),
  })
}

/**
 * Signs off one loading order.
 *
 * The id is the **loading order's**, not an authorisation's — see the service.
 * Approving appends to `authorizers[]` and, once the chain is complete, flips
 * `authorizationStatus`, so the loading orders list is refreshed by name
 * alongside the stockout orders it derives from.
 */
export const receptionOrdersQueryKey = ['stock-out-orders', 'reception-orders'] as const

/** Loading orders with their reception figures — see the service. */
export function useReceptionOrders({ enabled = true }: { enabled?: boolean } = {}) {
  const query = useQuery({
    queryKey: receptionOrdersQueryKey,
    queryFn: stockoutOrdersService.receptionOrders,
    staleTime: 60_000,
    enabled,
  })

  return {
    // Through `listRows`: this route returns a paginated envelope while its
    // sibling returns a bare array — see the service.
    receptionOrders: listRows(query.data),
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
  }
}

/**
 * Receives fuel into a cuve.
 *
 * Receiving moves stock from the load into the site's tank, so the reception
 * list, the loading orders it mirrors and the stockout orders behind both are
 * all refreshed.
 */
export function useReceiveOrder() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, ...body }: ReceptionRequest & { id: string }) =>
      stockoutOrdersService.receiveOrder(id, body),
    onSuccess: () =>
      invalidate(queryClient, 'stockoutOrders', [
        receptionOrdersQueryKey,
        loadingOrdersQueryKey,
      ]),
  })
}

export function useApproveLoadingOrder() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id }: { id: string }) => stockoutOrdersService.approveLoadingOrder(id),
    onSuccess: () => invalidate(queryClient, 'stockoutOrders', [loadingOrdersQueryKey]),
  })
}
