import { useMemo } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { itemsService } from '@/features/items/items.service'
import { invalidate } from '@/api/query-keys'
import type { ItemNode, ItemRequest } from '@/api/types'

export const itemsQueryKey = ['items'] as const

/** A tree node flattened into a table row, with its ancestry resolved. */
export interface ItemRow {
  id: string
  name: string
  descriptions: string | null
  baseUnitId: string
  depth: number
  parentId: string | null
  parentName: string | null
  childCount: number
}

/**
 * Depth-first walk so a child always appears directly beneath its parent.
 *
 * The tree carries no `parentId` — parentage is implied by nesting — so it is
 * reconstructed here, which is what lets the form pre-select a parent without
 * a second request per row.
 */
function flatten(
  nodes: ItemNode[],
  depth = 0,
  parentId: string | null = null,
  parentName: string | null = null,
  out: ItemRow[] = [],
): ItemRow[] {
  for (const node of [...nodes].sort((a, b) => a.name.localeCompare(b.name))) {
    const children = node.items ?? []
    out.push({
      id: node.id,
      name: node.name,
      descriptions: node.descriptions,
      baseUnitId: node.baseUnitId,
      depth,
      parentId,
      parentName,
      childCount: children.length,
    })
    flatten(children, depth + 1, node.id, node.name, out)
  }
  return out
}

export function useItems({ enabled = true }: { enabled?: boolean } = {}) {
  const query = useQuery({
    queryKey: itemsQueryKey,
    queryFn: itemsService.list,
    staleTime: 60_000,
    // Skipped when the caller lacks read permission, so the UI never fires a
    // request the API would reject.
    enabled,
  })

  const rows = useMemo(() => (query.data ? flatten(query.data) : []), [query.data])

  return {
    rows,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
  }
}

export function useSaveItem() {
  const queryClient = useQueryClient()

  return useMutation({
    // One mutation for both paths: an id means update, its absence means create.
    mutationFn: ({ id, ...item }: ItemRequest & { id?: string }) =>
      id ? itemsService.update(id, item) : itemsService.create(item),
    onSuccess: () => invalidate(queryClient, 'items'),
  })
}

export function useToggleItemStatus() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: string) => itemsService.toggleStatus(id),
    onSuccess: () => invalidate(queryClient, 'items'),
  })
}
