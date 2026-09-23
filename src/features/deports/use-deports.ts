import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { deportsService } from '@/features/deports/deports.service'
import type { DeportRequest } from '@/api/types'

export const deportsQueryKey = ['deports'] as const

export function useDeports({ enabled = true }: { enabled?: boolean } = {}) {
  const query = useQuery({
    queryKey: deportsQueryKey,
    queryFn: deportsService.list,
    staleTime: 60_000,
    // Skipped when the caller lacks read permission, so the UI never fires a
    // request the API would reject.
    enabled,
  })

  return {
    deports: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
  }
}

export function useSaveDeport() {
  const queryClient = useQueryClient()

  return useMutation({
    // One mutation for both paths: an id means update, its absence means create.
    mutationFn: ({ id, ...body }: DeportRequest & { id?: string }) =>
      id ? deportsService.update(id, body) : deportsService.create(body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: deportsQueryKey }),
  })
}

export function useToggleDeportStatus() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: string) => deportsService.toggleStatus(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: deportsQueryKey }),
  })
}
