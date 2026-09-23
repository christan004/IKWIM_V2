import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { transportersService } from '@/features/transporters/transporters.service'
import type { TransporterRequest } from '@/api/types'

export const transportersQueryKey = ['transporters'] as const

export function useTransporters({ enabled = true }: { enabled?: boolean } = {}) {
  const query = useQuery({
    queryKey: transportersQueryKey,
    queryFn: transportersService.list,
    staleTime: 60_000,
    // Skipped when the caller lacks read permission, so the UI never fires a
    // request the API would reject.
    enabled,
  })

  return {
    transporters: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
  }
}

export function useSaveTransporter() {
  const queryClient = useQueryClient()

  return useMutation({
    // One mutation for both paths: an id means update, its absence means create.
    mutationFn: ({ id, ...body }: TransporterRequest & { id?: string }) =>
      id ? transportersService.update(id, body) : transportersService.create(body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: transportersQueryKey }),
  })
}

export function useToggleTransporterStatus() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: string) => transportersService.toggleStatus(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: transportersQueryKey }),
  })
}
