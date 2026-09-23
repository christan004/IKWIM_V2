import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { usersService } from '@/features/users/users.service'
import { rolesService } from '@/features/roles/roles.service'
import type { CreateUserRequest, UpdateUserRequest } from '@/api/types'

export const usersQueryKey = ['users'] as const

export function useUsers({ enabled = true }: { enabled?: boolean } = {}) {
  const query = useQuery({
    queryKey: usersQueryKey,
    // Skipped when the caller lacks read permission, so the UI never fires a
    // request the API would reject.
    enabled,
    // The table paginates client-side, so pull a full page rather than mirror
    // the API's 20-row default.
    queryFn: () => usersService.list({ pageSize: 100 }),
    staleTime: 60_000,
  })

  return {
    users: query.data?.items ?? [],
    total: query.data?.pagination.total ?? 0,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
  }
}

/** Roles for the form's role dropdown. */
export function useRoleOptions() {
  const query = useQuery({
    queryKey: ['roles', 'options'],
    queryFn: () => rolesService.list({ pageSize: 100 }),
    staleTime: 5 * 60_000,
  })

  return {
    // A user cannot be assigned an inactive role.
    roles: (query.data?.items ?? []).filter((role) => role.isActive),
    isLoading: query.isLoading,
  }
}

export function useToggleUserStatus() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: string) => usersService.toggleStatus(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: usersQueryKey }),
  })
}

/** Partial update of a user's own fields. */
export function useUpdateUser() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, ...body }: UpdateUserRequest & { id: string }) =>
      usersService.update(id, body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: usersQueryKey }),
  })
}

/**
 * Assigns a user to a site via the dedicated `PATCH /users/:id/site`, which
 * takes `siteId` on its own — unlike `PUT /users/:id`, which rejects it alone.
 */
export function useAssignUserSite() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, siteId }: { id: string; siteId: string }) =>
      usersService.assignSite(id, { siteId }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: usersQueryKey }),
  })
}

export function useCreateUser() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (user: CreateUserRequest) => usersService.create(user),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: usersQueryKey }),
  })
}
