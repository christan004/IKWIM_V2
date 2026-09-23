import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { nominationsService } from '@/features/nominations/nominations.service'
import { invalidate } from '@/api/query-keys'
import type { NominationFilter, NominationRequest } from '@/api/types'

export const nominationsQueryKey = ['nominations'] as const

export function useNominations({
  enabled = true,
  filter,
}: { enabled?: boolean; filter?: NominationFilter } = {}) {
  const query = useQuery({
    // The filter is part of the key, so each combination caches separately.
    queryKey: [...nominationsQueryKey, filter ?? {}],
    queryFn: () => nominationsService.list(filter),
    staleTime: 60_000,
    // Skipped when the caller lacks read permission, so the UI never fires a
    // request the API would reject.
    enabled,
    // Keeps the previous rows on screen while a new filter loads.
    placeholderData: (previous) => previous,
  })

  return {
    nominations: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
  }
}

/**
 * Progress for one nomination. Fetched lazily — the timeline is one request per
 * nomination, so it is only issued when a row is actually expanded.
 */
export function useNominationTimeline(id: string | undefined, { enabled = true } = {}) {
  const query = useQuery({
    queryKey: [...nominationsQueryKey, id, 'timeline'],
    queryFn: () => nominationsService.timeline(id!),
    enabled: Boolean(id) && enabled,
    staleTime: 30_000,
  })

  return {
    // `[]` is a valid answer meaning "no stage recorded", not an error.
    entries: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
  }
}

/**
 * Fetches one record. The list carries no date at all, so the edit form has to
 * read from here — it is the only place that field exists.
 */
export function useNomination(id: string | undefined) {
  const query = useQuery({
    queryKey: [...nominationsQueryKey, id],
    queryFn: () => nominationsService.get(id!),
    enabled: Boolean(id),
    staleTime: 60_000,
  })

  return { nomination: query.data ?? null, isLoading: query.isLoading }
}

export function useSaveNomination() {
  const queryClient = useQueryClient()

  return useMutation({
    // One mutation for both paths: an id means update, its absence means create.
    mutationFn: ({ id, ...body }: NominationRequest & { id?: string }) =>
      id ? nominationsService.update(id, body) : nominationsService.create(body),
    onSuccess: (_data, variables) => {
      // Nominations draw down stock, and both PFI and T1 hang off them.
      invalidate(queryClient, 'nominations', [
        // The detail query and the timeline are per-record, so they are named
        // explicitly — the domain map cannot know the id.
        ...(variables.id
          ? [
              [...nominationsQueryKey, variables.id],
              [...nominationsQueryKey, variables.id, 'timeline'],
            ]
          : []),
      ])
    },
  })
}
