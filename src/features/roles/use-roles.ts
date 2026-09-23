import { useMemo } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { rolesService } from '@/features/roles/roles.service'
import { modulesService } from '@/features/modules/modules.service'
import { modulesListQueryKey } from '@/features/modules/use-modules'
import { toModuleTree, type ModuleTreeNode } from '@/features/modules/module-tree'
import { isManage } from '@/features/roles/permission-rules'
import type { AssignRolePermissionsRequest, CreateRoleRequest } from '@/api/types'

export const rolesQueryKey = ['roles'] as const

export function useRoles({ enabled = true }: { enabled?: boolean } = {}) {
  const query = useQuery({
    queryKey: rolesQueryKey,
    // Skipped when the caller lacks read permission, so the UI never fires a
    // request the API would reject.
    enabled,
    // The table paginates client-side, so pull a full page rather than mirror
    // the API's 20-row default.
    queryFn: () => rolesService.list({ pageSize: 100 }),
    staleTime: 60_000,
  })

  return {
    roles: query.data?.items ?? [],
    total: query.data?.pagination.total ?? 0,
    isLoading: query.isLoading,
    isError: query.isError,
  }
}

/**
 * The module tree, for the permission picker.
 *
 * There is no `/permissions` endpoint, so permissions are sourced from
 * `/modules/list`, which returns every module with the five generated for it.
 * The picker renders the same hierarchy as the modules table by reusing
 * `toModuleTree`.
 */
export function usePermissionTree() {
  const query = useQuery({
    queryKey: modulesListQueryKey,
    queryFn: modulesService.list,
    staleTime: 60_000,
  })

  const nodes = useMemo<ModuleTreeNode[]>(
    () => {
      const data = query.data
      if (!data) return []
      /*
       * ⚠️ `/modules/list` served a **`[rows, total]` tuple** earlier today.
       * Passed straight to `toModuleTree`, the two positional entries were
       * walked as if each were a module — neither has a `parentId`, so the
       * roots filter discarded both and this picker came back **empty**. The
       * Modules page failed the same way; unwrapping first handles either shape.
       */
      const modules = Array.isArray(data[0]) ? (data[0] as unknown as typeof data) : data
      return (
        toModuleTree(modules)
            // A module with no permissions offers nothing to pick.
            .filter((node) => node.permissions.length > 0)
            .map((node) => ({
              ...node,
              // Alphabetical, but `.manage` last: it is the broadest grant on a
              // module, so it reads better as the final option than buried
              // between `edit` and `read`.
              permissions: [...node.permissions].sort((a, b) => {
                const aManage = isManage(a.code)
                const bManage = isManage(b.code)
                if (aManage !== bManage) return aManage ? 1 : -1
                return a.code.localeCompare(b.code)
              }),
            }))
      )
    },
    [query.data],
  )

  return {
    nodes,
    isLoading: query.isLoading,
    isError: query.isError,
  }
}

export function useCreateRole() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (role: CreateRoleRequest) => rolesService.create(role),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: rolesQueryKey }),
  })
}

export function useAssignPermissions() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({
      roleId,
      ...body
    }: AssignRolePermissionsRequest & { roleId: string }) =>
      rolesService.assignPermissions(roleId, body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: rolesQueryKey }),
  })
}

export function useDeleteRole() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: string) => rolesService.remove(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: rolesQueryKey }),
  })
}
