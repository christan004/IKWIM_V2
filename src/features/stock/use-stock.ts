import { useMemo } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { stockService } from '@/features/stock/stock.service'
import { invalidate } from '@/api/query-keys'
import type { StockFilter, StockGroup, StockStatus } from '@/api/types'

export const stockQueryKey = ['stock'] as const

/** Stable empty array, so `groups` keeps a constant identity while loading. */
const EMPTY_GROUPS: StockGroup[] = []

export function useStockList({
  enabled = true,
  filter,
}: { enabled?: boolean; filter?: StockFilter } = {}) {
  const query = useQuery({
    // The filter is part of the key, so each combination caches separately and
    // switching back to a previous one is instant.
    queryKey: [...stockQueryKey, filter ?? {}],
    queryFn: () => stockService.list(filter),
    staleTime: 60_000,
    // Skipped when the caller lacks read permission, so the UI never fires a
    // request the API would reject.
    enabled,
    // Keeps the previous rows on screen while a new filter loads, so the table
    // does not flash empty on every change.
    placeholderData: (previous) => previous,
  })

  const groups = query.data ?? EMPTY_GROUPS

  /**
   * The same records flattened.
   *
   * The API groups by item, which suits the stock table but not the pickers
   * that need to choose **one** stock line — so both shapes are exposed rather
   * than making every caller flatten it again.
   *
   * The group's `item` is **copied onto each row**: a stock row no longer
   * carries one of its own, and without it a picker could not name what it is
   * offering.
   */
  const stock = useMemo(
    () => groups.flatMap((group) => (group.stocks ?? []).map((row) => ({ ...row, item: group.item }))),
    [groups],
  )

  return {
    /** One entry per item, each with a `totalQuantity` and its own `stocks`. */
    groups,
    /** Every individual stock record, ungrouped. */
    stock,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
  }
}

/**
 * The status change is the only write this console makes against stock — the
 * records themselves come from the cargo flow.
 */
export function useSetStockStatus() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: StockStatus }) =>
      stockService.setStatus(id, status),
    // Cargo carries a `stocks[]` array and orders derive `remainingStock` from
    // stock, so both follow — see the dependency map in `query-keys.ts`.
    onSuccess: () => invalidate(queryClient, 'stock'),
  })
}
