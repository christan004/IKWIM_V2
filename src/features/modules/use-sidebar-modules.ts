import { useQuery } from '@tanstack/react-query'
import { modulesService } from '@/features/modules/modules.service'
import { modulesSidebarQueryKey } from '@/features/modules/use-modules'
import { moduleRoute } from '@/lib/module-registry'
import type { ModuleLevel, SidebarModule } from '@/api/types'
import type { LucideIcon } from 'lucide-react'

/** A sidebar node with its level, route, and icon resolved. */
export interface NavNode {
  id: string
  name: string
  code: string
  /** module (depth 0) -> service (depth 1) -> feature (depth 2+). */
  level: ModuleLevel
  path?: string
  icon?: LucideIcon
  children: NavNode[]
  /** False when the code has no entry in the module registry. */
  isMapped: boolean
}

const LEVELS: ModuleLevel[] = ['module', 'service', 'feature']

/**
 * `sorting` is currently 0 on every node the API returns, which would leave the
 * order undefined. Falling back to the display name keeps it stable and
 * alphabetical until the backend populates real values.
 */
function bySortingThenName(a: SidebarModule, b: SidebarModule) {
  if (a.sorting !== b.sorting) return a.sorting - b.sorting
  return a.name.localeCompare(b.name)
}

function toNavNodes(nodes: SidebarModule[], depth = 0): NavNode[] {
  return (
    [...nodes]
      .sort(bySortingThenName)
      // Modules whose UI lives inside another page — listing them would duplicate
      // an existing link. See `ModuleRoute.hidden`.
      .filter((node) => !moduleRoute(node.code)?.hidden)
      .map((node) => {
        const registered = moduleRoute(node.code)
        return {
          id: node.id,
          name: node.name,
          code: node.code,
          level: LEVELS[Math.min(depth, LEVELS.length - 1)],
          path: registered?.path,
          icon: registered?.icon,
          isMapped: registered !== undefined,
          children: toNavNodes(node.children ?? [], depth + 1),
        }
      })
  )
}

export function useSidebarModules() {
  const query = useQuery({
    queryKey: modulesSidebarQueryKey,
    queryFn: modulesService.sidebar,
    // The navigation tree changes rarely; refetching it on every mount would be
    // wasted traffic on a menu the user is already looking at.
    staleTime: 5 * 60_000,
  })

  return {
    modules: query.data ? toNavNodes(query.data) : [],
    isLoading: query.isLoading,
    isError: query.isError,
  }
}

/** Flattens the tree to every node that has a route — used to build routes. */
export function flattenRoutable(nodes: NavNode[]): NavNode[] {
  return nodes.flatMap((node) => [
    ...(node.path ? [node] : []),
    ...flattenRoutable(node.children),
  ])
}
