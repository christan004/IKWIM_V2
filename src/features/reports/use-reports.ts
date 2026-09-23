import { useQuery } from '@tanstack/react-query'
import { reportsService } from '@/features/reports/reports.service'
import { QK } from '@/api/query-keys'
import type { SupplyChainReportFilter } from '@/api/types'

export const reportsQueryKey = QK.reports

/** The five order groupings, keyed by the tab that selects them. */
export const ORDER_REPORT_VIEWS = {
  details: reportsService.orderDetails,
  supplier: reportsService.bySupplier,
  item: reportsService.byItem,
  deport: reportsService.byDeport,
  plan: reportsService.byOrderPlan,
} as const

export type OrderReportView = keyof typeof ORDER_REPORT_VIEWS

/**
 * One order report, for whichever grouping is selected.
 *
 * The view is part of the key, so switching tabs caches each grouping
 * separately rather than refetching a view already on screen. The filter is too,
 * for the same reason.
 */
export function useOrderReport({
  view,
  filter,
  enabled = true,
}: {
  view: OrderReportView
  filter: SupplyChainReportFilter
  enabled?: boolean
}) {
  const query = useQuery({
    queryKey: [...reportsQueryKey, 'order', view, filter],
    queryFn: () => ORDER_REPORT_VIEWS[view](filter),
    staleTime: 60_000,
    enabled,
    // Keeps the previous grouping on screen while the next loads, so switching
    // tabs does not blank the table.
    placeholderData: (previous) => previous,
  })

  return {
    summary: query.data?.summary ?? null,
    rows: query.data?.details?.items ?? [],
    pagination: query.data?.details?.pagination ?? null,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    isError: query.isError,
    error: query.error,
  }
}

/** The two central-stock views, which share an envelope and a filter set. */
export const CENTRAL_STOCK_REPORT_VIEWS = {
  stock: reportsService.centralStock,
  transactions: reportsService.centralStockTransactions,
} as const

export type CentralStockReportView = keyof typeof CENTRAL_STOCK_REPORT_VIEWS

/**
 * One central-stock report.
 *
 * ⚠️ These put `items` and `pagination` at the top level beside `summary`,
 * unlike the order reports which nest them under `details` — see the service.
 */
export function useCentralStockReport({
  view,
  filter,
  enabled = true,
}: {
  view: CentralStockReportView
  filter: SupplyChainReportFilter
  enabled?: boolean
}) {
  const query = useQuery({
    queryKey: [...reportsQueryKey, 'central-stock', view, filter],
    queryFn: () => CENTRAL_STOCK_REPORT_VIEWS[view](filter),
    staleTime: 60_000,
    enabled,
    placeholderData: (previous) => previous,
  })

  return {
    summary: query.data?.summary ?? null,
    rows: query.data?.items ?? [],
    pagination: query.data?.pagination ?? null,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    isError: query.isError,
    error: query.error,
  }
}
