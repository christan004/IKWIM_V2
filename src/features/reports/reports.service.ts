import { apiClient } from '@/api/axios-instance'
import type {
  CentralStockReportResponse,
  CentralStockReportRow,
  CentralStockReportSummary,
  CentralStockTransactionReportRow,
  CentralStockTransactionReportSummary,
  OrderReportByDeport,
  OrderReportByItem,
  OrderReportByOrderPlan,
  OrderReportBySupplier,
  OrderReportDetail,
  OrderReportResponse,
  SupplyChainReportFilter,
} from '@/api/types'

const BASE = '/supply-chain-report'

/**
 * Only set filters are sent.
 *
 * Each is validated when present — `startDate=` returns `400` rather than
 * meaning "no filter" — so blanks are stripped rather than passed through.
 */
function toParams(filter: SupplyChainReportFilter) {
  return Object.fromEntries(
    Object.entries(filter).filter(([, value]) => value !== undefined && value !== ''),
  )
}

/**
 * The supply-chain reports.
 *
 * ⚠️ **Every route is `GET` with query parameters** — `POST` returns
 * `ROUTE_NOT_FOUND` on all seven, so the documented JSON body does not apply.
 * See `SupplyChainReportFilter` for the parameter names, two of which differ
 * from the obvious spelling and are silently ignored if guessed wrong.
 */
export const reportsService = {
  /** Ungrouped: one row per order, with its cargos nested. */
  orderDetails: (filter: SupplyChainReportFilter = {}) =>
    apiClient<OrderReportResponse<OrderReportDetail>>({
      url: `${BASE}/order-details`,
      method: 'GET',
      params: toParams(filter),
    }),

  bySupplier: (filter: SupplyChainReportFilter = {}) =>
    apiClient<OrderReportResponse<OrderReportBySupplier>>({
      url: `${BASE}/order-report/by-supplier`,
      method: 'GET',
      params: toParams(filter),
    }),

  byItem: (filter: SupplyChainReportFilter = {}) =>
    apiClient<OrderReportResponse<OrderReportByItem>>({
      url: `${BASE}/order-report/by-item`,
      method: 'GET',
      params: toParams(filter),
    }),

  byDeport: (filter: SupplyChainReportFilter = {}) =>
    apiClient<OrderReportResponse<OrderReportByDeport>>({
      url: `${BASE}/order-report/by-deport`,
      method: 'GET',
      params: toParams(filter),
    }),

  byOrderPlan: (filter: SupplyChainReportFilter = {}) =>
    apiClient<OrderReportResponse<OrderReportByOrderPlan>>({
      url: `${BASE}/order-report/by-order-plan`,
      method: 'GET',
      params: toParams(filter),
    }),

  /**
   * ⚠️ A different envelope from the five above — `items` and `pagination` sit
   * beside `summary` rather than under `details`. And only `itemId` and the
   * dates narrow it; the other filters are silently ignored.
   */
  centralStock: (filter: SupplyChainReportFilter = {}) =>
    apiClient<CentralStockReportResponse<CentralStockReportRow, CentralStockReportSummary>>({
      url: `${BASE}/central-stock`,
      method: 'GET',
      params: toParams(filter),
    }),

  /** Same envelope and same filter limits as `centralStock`. */
  centralStockTransactions: (filter: SupplyChainReportFilter = {}) =>
    apiClient<
      CentralStockReportResponse<
        CentralStockTransactionReportRow,
        CentralStockTransactionReportSummary
      >
    >({
      url: `${BASE}/central-stock/transactions`,
      method: 'GET',
      params: toParams(filter),
    }),
}
