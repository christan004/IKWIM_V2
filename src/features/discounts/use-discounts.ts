import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { discountsService } from '@/features/discounts/discounts.service'
import { invalidate } from '@/api/query-keys'
import type { DiscountRequest } from '@/api/types'

export const discountsQueryKey = ['discounts'] as const

export function useDiscounts({ enabled = true }: { enabled?: boolean } = {}) {
  const query = useQuery({
    queryKey: discountsQueryKey,
    queryFn: discountsService.list,
    staleTime: 60_000,
    // Skipped when the caller lacks read permission, so the UI never fires a
    // request the API would reject.
    enabled,
  })

  return {
    discounts: query.data?.items ?? [],
    pagination: query.data?.pagination ?? null,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
  }
}

export function useSaveDiscount() {
  const queryClient = useQueryClient()

  return useMutation({
    // One mutation for both paths: an id means update, its absence means create.
    mutationFn: ({ id, ...body }: DiscountRequest & { id?: string }) =>
      id ? discountsService.update(id, body as DiscountRequest) : discountsService.create(body as DiscountRequest),
    onSuccess: () => invalidate(queryClient, 'discounts'),
  })
}

export function useToggleDiscountStatus() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: string) => discountsService.toggleStatus(id),
    onSuccess: () => invalidate(queryClient, 'discounts'),
  })
}

export function useDeleteDiscount() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: string) => discountsService.remove(id),
    onSuccess: () => invalidate(queryClient, 'discounts'),
  })
}
