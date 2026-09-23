import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { orderPlansService } from '@/features/orders/order-plans.service'
import type { OrderPlanRequest, OrderPlanStatus } from '@/api/types'

export const orderPlansQueryKey = ['orders', 'order-plan'] as const

export function useOrderPlans({ enabled = true }: { enabled?: boolean } = {}) {
  const query = useQuery({
    queryKey: orderPlansQueryKey,
    queryFn: orderPlansService.list,
    staleTime: 60_000,
    // Skipped when the caller lacks read permission, so the UI never fires a
    // request the API would reject.
    enabled,
  })

  return {
    plans: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
  }
}

export function useSaveOrderPlan() {
  const queryClient = useQueryClient()

  return useMutation({
    // One mutation for both paths: an id means update, its absence means create.
    mutationFn: ({ id, ...body }: OrderPlanRequest & { id?: string }) =>
      id ? orderPlansService.update(id, body) : orderPlansService.create(body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: orderPlansQueryKey }),
  })
}

export function useSetOrderPlanStatus() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: OrderPlanStatus }) =>
      orderPlansService.setStatus(id, status),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: orderPlansQueryKey }),
  })
}
