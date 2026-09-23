import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supplierTypesService } from '@/features/suppliers/supplier-types.service'
import { listRows } from '@/api/types'
import type { SupplierTypeRequest } from '@/api/types'

export const supplierTypesQueryKey = ['suppliers', 'supplier-type'] as const

export function useSupplierTypes({ enabled = true }: { enabled?: boolean } = {}) {
  const query = useQuery({
    queryKey: supplierTypesQueryKey,
    queryFn: supplierTypesService.list,
    staleTime: 60_000,
    // Skipped when the caller lacks read permission, so the UI never fires a
    // request the API would reject.
    enabled,
  })

  return {
    // Tolerates both shapes — the endpoint has served each. See `listRows`.
    types: listRows(query.data),
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
  }
}

export function useSaveSupplierType() {
  const queryClient = useQueryClient()

  return useMutation({
    // One mutation for both paths: an id means update, its absence means create.
    mutationFn: ({ id, ...body }: SupplierTypeRequest & { id?: string }) =>
      id ? supplierTypesService.update(id, body) : supplierTypesService.create(body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: supplierTypesQueryKey }),
  })
}

export function useToggleSupplierTypeStatus() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: string) => supplierTypesService.toggleStatus(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: supplierTypesQueryKey }),
  })
}
