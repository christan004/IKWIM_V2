import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { sitesService } from '@/features/pss/pss.service'
import { invalidate } from '@/api/query-keys'
import type { SiteRequest } from '@/api/types'

export const sitesQueryKey = ['sites'] as const

export function useSites({ enabled = true }: { enabled?: boolean } = {}) {
  const query = useQuery({
    queryKey: sitesQueryKey,
    queryFn: sitesService.list,
    staleTime: 60_000,
    // Skipped when the caller lacks read permission, so the UI never fires a
    // request the API would reject.
    enabled,
  })

  return {
    sites: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
  }
}

/** Fetches one site, as the edit form is opened by id. */
export function useSite(id: string | undefined) {
  const query = useQuery({
    queryKey: [...sitesQueryKey, id],
    queryFn: () => sitesService.get(id!),
    enabled: Boolean(id),
    staleTime: 60_000,
  })

  return { site: query.data ?? null, isLoading: query.isLoading }
}

/**
 * Toggles a site between active and inactive. The endpoint takes no target
 * state, so the UI cannot set one — it can only flip.
 */
export function useToggleSiteStatus() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: string) => sitesService.toggleStatus(id),
    // Everything mounted on a site — pumps, cuves, displays, nozzles — and the
    // users scoped to it all read the site's state.
    onSuccess: () => invalidate(queryClient, 'sites'),
  })
}

export function useSaveSite() {
  const queryClient = useQueryClient()

  return useMutation({
    // One mutation for both paths: an id means update, its absence means create.
    mutationFn: ({ id, ...body }: SiteRequest & { id?: string }) =>
      id ? sitesService.update(id, body) : sitesService.create(body),
    onSuccess: (_data, variables) => {
      invalidate(queryClient, 'sites')
      if (variables.id) {
        queryClient.invalidateQueries({ queryKey: [...sitesQueryKey, variables.id] })
      }
    },
  })
}
