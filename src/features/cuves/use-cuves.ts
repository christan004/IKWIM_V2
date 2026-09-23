import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { cuvesService } from '@/features/cuves/cuves.service'
import { invalidate } from '@/api/query-keys'
import type { CuveRequest } from '@/api/types'

export const cuvesQueryKey = ['cuves'] as const

export function useCuves({ enabled = true }: { enabled?: boolean } = {}) {
  const query = useQuery({
    queryKey: cuvesQueryKey,
    queryFn: cuvesService.list,
    staleTime: 60_000,
    // Skipped when the caller lacks read permission, so the UI never fires a
    // request the API would reject.
    enabled,
  })

  return {
    cuves: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
  }
}

/**
 * Fetches one cuve. The list omits `itemId` and `siteId`, so the edit form
 * reads from here — it is the only source of the ids it binds to.
 */
export function useCuve(id: string | undefined) {
  const query = useQuery({
    queryKey: [...cuvesQueryKey, id],
    queryFn: () => cuvesService.get(id!),
    enabled: Boolean(id),
    staleTime: 60_000,
  })

  return { cuve: query.data ?? null, isLoading: query.isLoading }
}

export function useSaveCuve() {
  const queryClient = useQueryClient()

  return useMutation({
    // One mutation for both paths: an id means update, its absence means create.
    mutationFn: ({ id, ...body }: CuveRequest & { id?: string }) =>
      id ? cuvesService.update(id, body) : cuvesService.create(body),
    onSuccess: (_data, variables) => {
      invalidate(queryClient, 'cuves')
      if (variables.id) {
        queryClient.invalidateQueries({ queryKey: [...cuvesQueryKey, variables.id] })
      }
    },
  })
}

/**
 * Toggles a cuve between active and inactive. The endpoint takes no target
 * state, so the UI cannot set one — it can only flip.
 */
export function useToggleCuveStatus() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: string) => cuvesService.toggleStatus(id),
    onSuccess: () => invalidate(queryClient, 'cuves'),
  })
}
