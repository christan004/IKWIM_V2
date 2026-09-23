import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { pumpsService } from '@/features/pumps/pumps.service'
import { invalidate } from '@/api/query-keys'
import type { PumpRequest } from '@/api/types'

export const pumpsQueryKey = ['pumps'] as const

export function usePumps({ enabled = true }: { enabled?: boolean } = {}) {
  const query = useQuery({
    queryKey: pumpsQueryKey,
    queryFn: pumpsService.list,
    staleTime: 60_000,
    // Skipped when the caller lacks read permission, so the UI never fires a
    // request the API would reject.
    enabled,
  })

  return {
    pumps: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
  }
}

/**
 * Fetches one pump. The list omits `siteId` and `status` entirely, so the edit
 * form has to read from here — it is the only source of the id it binds to.
 */
export function usePump(id: string | undefined) {
  const query = useQuery({
    queryKey: [...pumpsQueryKey, id],
    queryFn: () => pumpsService.get(id!),
    enabled: Boolean(id),
    staleTime: 60_000,
  })

  return { pump: query.data ?? null, isLoading: query.isLoading }
}

export function useSavePump() {
  const queryClient = useQueryClient()

  return useMutation({
    // One mutation for both paths: an id means update, its absence means create.
    mutationFn: ({ id, ...body }: PumpRequest & { id?: string }) =>
      id ? pumpsService.update(id, body) : pumpsService.create(body),
    // Sites nest their pumps, and displays and nozzles mount on them.
    onSuccess: (_data, variables) =>
      invalidate(queryClient, 'pumps', variables.id ? [[...pumpsQueryKey, variables.id]] : []),
  })
}

/**
 * Toggles a pump between active and inactive. The endpoint takes no target
 * state, so the UI cannot set one — it can only flip.
 */
export function useTogglePumpStatus() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: string) => pumpsService.toggleStatus(id),
    onSuccess: () => invalidate(queryClient, 'pumps'),
  })
}
