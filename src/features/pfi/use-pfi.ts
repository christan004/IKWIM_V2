import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { currencyService, pfiService } from '@/features/pfi/pfi.service'
import { invalidate } from '@/api/query-keys'
import type { CurrencyRequest, PfiFilter, PfiRequest } from '@/api/types'

export const pfiQueryKey = ['pfi'] as const
// Deliberately not ['pfi', 'currency']: React Query matches keys by prefix, so
// that would make every PFI invalidation refetch the currencies too.
export const currencyQueryKey = ['currencies'] as const

export function usePfiList({
  enabled = true,
  filter,
}: { enabled?: boolean; filter?: PfiFilter } = {}) {
  const query = useQuery({
    // The filter is part of the key, so each combination caches separately.
    queryKey: [...pfiQueryKey, filter ?? {}],
    queryFn: () => pfiService.list(filter),
    staleTime: 60_000,
    // Skipped when the caller lacks read permission, so the UI never fires a
    // request the API would reject.
    enabled,
    // Keeps the previous rows on screen while a new filter loads.
    placeholderData: (previous) => previous,
  })

  return {
    pfis: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
  }
}

/**
 * Fetches one record. The list nests `currency` but omits `currencyId`, so the
 * edit form reads from here — it is the only source of the id the form binds to.
 */
export function usePfi(id: string | undefined) {
  const query = useQuery({
    queryKey: [...pfiQueryKey, id],
    queryFn: () => pfiService.get(id!),
    enabled: Boolean(id),
    staleTime: 60_000,
  })

  return { pfi: query.data ?? null, isLoading: query.isLoading }
}

export function useSavePfi() {
  const queryClient = useQueryClient()

  return useMutation({
    // One mutation for both paths: an id means update, its absence means create.
    mutationFn: ({ id, ...body }: PfiRequest & { id?: string }) =>
      id ? pfiService.update(id, body) : pfiService.create(body),
    // A PFI hangs off a nomination, so the nomination's own view of it follows.
    onSuccess: (_data, variables) =>
      invalidate(queryClient, 'pfi', variables.id ? [[...pfiQueryKey, variables.id]] : []),
  })
}

export function useCurrencies({ enabled = true }: { enabled?: boolean } = {}) {
  const query = useQuery({
    queryKey: currencyQueryKey,
    queryFn: currencyService.list,
    staleTime: 60_000,
    enabled,
  })

  return {
    currencies: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
  }
}

export function useSaveCurrency() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, ...body }: CurrencyRequest & { id?: string }) =>
      id ? currencyService.update(id, body) : currencyService.create(body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: currencyQueryKey })
      // PFI rows nest the currency, so they change with it.
      invalidate(queryClient, 'pfi')
    },
  })
}
