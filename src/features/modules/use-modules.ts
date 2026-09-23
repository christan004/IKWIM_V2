import { useMemo } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { modulesService } from '@/features/modules/modules.service'
import { toModuleTree, type ModuleTreeNode } from '@/features/modules/module-tree'
import type {
  CreateModuleRequest,
  ModuleLevel,
  ModuleListNode,
  ModuleSortingEntry,
  UpdateModuleRequest,
} from '@/api/types'

export const modulesListQueryKey = ['modules', 'list'] as const
export const modulesSidebarQueryKey = ['modules', 'sidebar'] as const

/** Re-exported so pages import their row type from the feature they render. */
export type ModuleRow = ModuleTreeNode

/** Options for the parent dropdown. */
export interface ParentOption {
  id: string
  name: string
  depth: number
  level: ModuleLevel
}

export function useModules({ enabled = true }: { enabled?: boolean } = {}) {
  const query = useQuery({
    queryKey: modulesListQueryKey,
    // Skipped when the caller lacks read permission, so the UI never fires a
    // request the API would reject.
    enabled,
    queryFn: modulesService.list,
    staleTime: 60_000,
  })

  /**
   * ⚠️ `/modules/list` served a **`[rows, total]` tuple** earlier today —
   * `data[0]` the 42 modules, `data[1]` the count — and a bare array since.
   * Against the tuple, `toModuleTree` walked the two positional entries as if
   * each were a module; neither has a `parentId`, so the `parentId === null`
   * roots filter discarded both and the page rendered **nothing**.
   *
   * Unwrapping first means either shape works.
   */
  const rows = useMemo(() => {
    const data = query.data
    if (!data) return []
    // A tuple is an array whose first entry is itself an array.
    const nodes = Array.isArray(data[0]) ? (data[0] as unknown as ModuleListNode[]) : data
    return toModuleTree(nodes)
  }, [query.data])

  const parentOptions = useMemo<ParentOption[]>(
    () =>
      rows
        // A feature is the deepest level the sidebar renders, so offering one as
        // a parent would create a node the navigation cannot display.
        .filter((row) => row.level !== 'feature')
        .map(({ id, name, depth, level }) => ({ id, name, depth, level })),
    [rows],
  )

  return {
    rows,
    parentOptions,
    isLoading: query.isLoading,
    isError: query.isError,
  }
}

export function useDeleteModule() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: string) => modulesService.remove(id),
    onSuccess: () => {
      // Both views can change: the table reads /modules/list, the sidebar reads
      // /modules/sidebar, and children are promoted rather than deleted.
      queryClient.invalidateQueries({ queryKey: modulesListQueryKey })
      queryClient.invalidateQueries({ queryKey: modulesSidebarQueryKey })
    },
  })
}

/**
 * Reorders one level of the tree. The whole level is sent together, so its
 * numbers stay contiguous rather than drifting apart with each single move.
 */
export function useChangeModuleSorting() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (entries: ModuleSortingEntry[]) => modulesService.changeSorting(entries),
    onSuccess: () => {
      // The sidebar is ordered by the same field, so it changes too.
      queryClient.invalidateQueries({ queryKey: modulesListQueryKey })
      queryClient.invalidateQueries({ queryKey: modulesSidebarQueryKey })
    },
  })
}

export function useUpdateModule() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, ...body }: UpdateModuleRequest & { id: string }) =>
      modulesService.update(id, body),
    onSuccess: () => {
      // Refresh both views: the table reads /modules/list, the sidebar reads
      // /modules/sidebar, and a rename shows in both.
      queryClient.invalidateQueries({ queryKey: modulesListQueryKey })
      queryClient.invalidateQueries({ queryKey: modulesSidebarQueryKey })
    },
  })
}

export function useCreateModule() {
  const queryClient = useQueryClient()

  return useMutation({
    // The endpoint is bulk; a single module is sent as a one-item array.
    mutationFn: (module: CreateModuleRequest) => modulesService.create([module]),
    onSuccess: () => {
      // Refresh both views: the table reads /modules/list, the sidebar reads
      // /modules/sidebar, and a new module can affect either.
      queryClient.invalidateQueries({ queryKey: modulesListQueryKey })
      queryClient.invalidateQueries({ queryKey: modulesSidebarQueryKey })
    },
  })
}
