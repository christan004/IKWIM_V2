import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { displaysService } from '@/features/displays/displays.service'
import { invalidate } from '@/api/query-keys'
import type { DisplayRequest } from '@/api/types'

export const displaysQueryKey = ['displays'] as const

export function useDisplays({ enabled = true }: { enabled?: boolean } = {}) {
  const query = useQuery({
    queryKey: displaysQueryKey,
    queryFn: displaysService.list,
    staleTime: 60_000,
    // Skipped when the caller lacks read permission, so the UI never fires a
    // request the API would reject.
    enabled,
  })

  return {
    displays: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
  }
}

/**
 * Fetches one display. The list omits `pumpId`, so the edit form reads from
 * here — it is the only source of the id it binds to.
 */
export function useDisplay(id: string | undefined) {
  const query = useQuery({
    queryKey: [...displaysQueryKey, id],
    queryFn: () => displaysService.get(id!),
    enabled: Boolean(id),
    staleTime: 60_000,
  })

  return { display: query.data ?? null, isLoading: query.isLoading }
}

export function useSaveDisplay() {
  const queryClient = useQueryClient()

  return useMutation({
    // One mutation for both paths: an id means update, its absence means create.
    mutationFn: ({ id, ...body }: DisplayRequest & { id?: string }) =>
      id ? displaysService.update(id, body) : displaysService.create(body),
    onSuccess: (_data, variables) => {
      invalidate(queryClient, 'displays')
      if (variables.id) {
        queryClient.invalidateQueries({ queryKey: [...displaysQueryKey, variables.id] })
      }
    },
  })
}

/**
 * Toggles a display between active and inactive. The endpoint takes no target
 * state, so the UI cannot set one — it can only flip.
 */
export function useToggleDisplayStatus() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: string) => displaysService.toggleStatus(id),
    onSuccess: () => invalidate(queryClient, 'displays'),
  })
}
