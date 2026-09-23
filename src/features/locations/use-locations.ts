import { useQuery } from '@tanstack/react-query'
import { locationsService } from '@/features/locations/locations.service'

export const locationsQueryKey = ['locations'] as const

/** The five provinces — the roots of the hierarchy. */
export function useProvinces({ enabled = true }: { enabled?: boolean } = {}) {
  const query = useQuery({
    queryKey: locationsQueryKey,
    queryFn: locationsService.list,
    // Administrative boundaries do not change during a session.
    staleTime: Infinity,
    enabled,
  })

  return {
    provinces: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
  }
}

/**
 * The children of one location.
 *
 * Fetched lazily — nothing is requested until a parent is chosen, so opening a
 * form does not pull the whole tree.
 */
export function useLocationChildren(parentId: string | undefined, { enabled = true } = {}) {
  const query = useQuery({
    queryKey: [...locationsQueryKey, 'parent', parentId],
    queryFn: () => locationsService.children(parentId!),
    staleTime: Infinity,
    enabled: Boolean(parentId) && enabled,
  })

  return {
    // `[]` is a valid answer meaning "no children", not an error.
    locations: query.data ?? [],
    isLoading: query.isLoading,
  }
}
