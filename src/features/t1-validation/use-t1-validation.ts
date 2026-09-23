import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { t1ValidationService } from '@/features/t1-validation/t1-validation.service'
import { invalidate } from '@/api/query-keys'
import type { T1Status, T1ValidationRequest } from '@/api/types'

export const t1ValidationQueryKey = ['t1-validation'] as const

/**
 * Confirmed validations only — what central stock can be received against.
 * Keyed separately so it never shares a cache entry with the full list.
 */
export function useConfirmedT1Validations({ enabled = true }: { enabled?: boolean } = {}) {
  const query = useQuery({
    queryKey: [...t1ValidationQueryKey, 'confirmed'],
    queryFn: t1ValidationService.listConfirmed,
    staleTime: 60_000,
    enabled,
  })

  return {
    validations: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
  }
}

export function useT1Validations({ enabled = true }: { enabled?: boolean } = {}) {
  const query = useQuery({
    queryKey: t1ValidationQueryKey,
    queryFn: t1ValidationService.list,
    staleTime: 60_000,
    // Skipped when the caller lacks read permission, so the UI never fires a
    // request the API would reject.
    enabled,
  })

  return {
    validations: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
  }
}

/**
 * There is no update endpoint, so nothing binds a form to a single record — but
 * the detail is still the only place the parent's own fields appear without the
 * nesting, so it is kept for a future detail view.
 */
export function useT1Validation(id: string | undefined) {
  const query = useQuery({
    queryKey: [...t1ValidationQueryKey, id],
    queryFn: () => t1ValidationService.get(id!),
    enabled: Boolean(id),
    staleTime: 60_000,
  })

  return { validation: query.data ?? null, isLoading: query.isLoading }
}

export function useCreateT1Validation() {
  const queryClient = useQueryClient()

  return useMutation({
    // Create only — the API exposes no update or delete for this resource.
    mutationFn: (body: T1ValidationRequest) => t1ValidationService.create(body),
    // A new T1 advances its nomination's timeline to `t1Pending`, so the
    // nomination's cached progress is stale.
    onSuccess: () => invalidate(queryClient, 't1Validation'),
  })
}

/**
 * Sets the status of an **extra validation**, not of the parent record — the id
 * is the child's. The parent list is what gets invalidated, since that is where
 * the children are returned.
 */
export function useSetT1Status() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: T1Status }) =>
      t1ValidationService.setStatus(id, status),
    // Confirming a T1 advances its nomination's timeline to `t1Confirmed`,
    // and a confirmed T1 is what central stock is raised from.
    onSuccess: () => invalidate(queryClient, 't1Validation'),
  })
}
