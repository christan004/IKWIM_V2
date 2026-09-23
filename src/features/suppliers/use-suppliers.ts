import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { suppliersService } from '@/features/suppliers/suppliers.service'
import { invalidate } from '@/api/query-keys'
import { listRows } from '@/api/types'
import type { SupplierRequest } from '@/api/types'

export const suppliersQueryKey = ['suppliers'] as const

export function useSuppliers({ enabled = true }: { enabled?: boolean } = {}) {
  const query = useQuery({
    queryKey: suppliersQueryKey,
    queryFn: suppliersService.list,
    staleTime: 60_000,
    // Skipped when the caller lacks read permission, so the UI never fires a
    // request the API would reject.
    enabled,
  })

  return {
    // Tolerates both shapes — the endpoint has served each. See `listRows`.
    suppliers: listRows(query.data),
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
  }
}

export function useSaveSupplier() {
  const queryClient = useQueryClient()

  return useMutation({
    // One mutation for both paths: an id means update, its absence means create.
    mutationFn: ({ id, ...body }: SupplierRequest & { id?: string }) =>
      id ? suppliersService.update(id, body) : suppliersService.create(body),
    // Orders nest the supplier, so their rows change with it.
    onSuccess: () => invalidate(queryClient, 'suppliers'),
  })
}

export function useToggleSupplierStatus() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: string) => suppliersService.toggleStatus(id),
    // A status change is visible wherever the supplier is nested.
    onSuccess: () => invalidate(queryClient, 'suppliers'),
  })
}
