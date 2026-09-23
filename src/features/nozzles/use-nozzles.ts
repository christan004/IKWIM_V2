import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { nozzlesService } from '@/features/nozzles/nozzles.service'
import { invalidate } from '@/api/query-keys'
import type { NozzleRequest } from '@/api/types'

export const nozzlesQueryKey = ['nozzles'] as const

export function useNozzles({ enabled = true }: { enabled?: boolean } = {}) {
  const query = useQuery({
    queryKey: nozzlesQueryKey,
    queryFn: nozzlesService.list,
    staleTime: 60_000,
    // Skipped when the caller lacks read permission, so the UI never fires a
    // request the API would reject.
    enabled,
  })

  return {
    nozzles: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
  }
}

/**
 * Fetches one nozzle. The list omits all three foreign keys, so the edit form
 * reads from here — it is the only source of the ids it binds to.
 */
export function useNozzle(id: string | undefined) {
  const query = useQuery({
    queryKey: [...nozzlesQueryKey, id],
    queryFn: () => nozzlesService.get(id!),
    enabled: Boolean(id),
    staleTime: 60_000,
  })

  return { nozzle: query.data ?? null, isLoading: query.isLoading }
}

export function useSaveNozzle() {
  const queryClient = useQueryClient()

  return useMutation({
    // One mutation for both paths: an id means update, its absence means create.
    mutationFn: ({ id, ...body }: NozzleRequest & { id?: string }) =>
      id ? nozzlesService.update(id, body) : nozzlesService.create(body),
    onSuccess: (_data, variables) => {
      invalidate(queryClient, 'nozzles')
      if (variables.id) {
        queryClient.invalidateQueries({ queryKey: [...nozzlesQueryKey, variables.id] })
      }
    },
  })
}

/**
 * Toggles a nozzle between active and inactive. The endpoint takes no target
 * state, so the UI cannot set one — it can only flip.
 */
export function useToggleNozzleStatus() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: string) => nozzlesService.toggleStatus(id),
    onSuccess: () => invalidate(queryClient, 'nozzles'),
  })
}
