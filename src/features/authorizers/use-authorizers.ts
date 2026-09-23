import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { authorizersService } from '@/features/authorizers/authorizers.service'
import { invalidate } from '@/api/query-keys'
import type { AuthorizerRequest } from '@/api/types'

export const authorizersQueryKey = ['authorizers'] as const

export function useAuthorizers({ enabled = true }: { enabled?: boolean } = {}) {
  const query = useQuery({
    queryKey: authorizersQueryKey,
    queryFn: authorizersService.list,
    staleTime: 60_000,
    // Skipped when the caller lacks read permission, so the UI never fires a
    // request the API would reject.
    enabled,
  })

  return {
    authorizers: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
  }
}

export function useSaveAuthorizer() {
  const queryClient = useQueryClient()

  return useMutation({
    // One mutation for both paths: an id means update, its absence means create.
    mutationFn: ({ id, ...body }: AuthorizerRequest & { id?: string }) =>
      id ? authorizersService.update(id, body) : authorizersService.create(body),
    onSuccess: () => invalidate(queryClient, 'authorizers'),
  })
}

export function useToggleAuthorizerStatus() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: string) => authorizersService.toggleStatus(id),
    onSuccess: () => invalidate(queryClient, 'authorizers'),
  })
}

export function useDeleteAuthorizer() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: string) => authorizersService.remove(id),
    onSuccess: () => invalidate(queryClient, 'authorizers'),
  })
}
