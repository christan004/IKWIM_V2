import { useMemo, useState } from 'react'
import { FileText } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { DataTable, type DataTableColumn } from '@/components/data-table'
import { NoAccess } from '@/components/no-access'
import { PERMISSION_MODULES, usePermissions } from '@/hooks/use-permissions'
import { errorCode, errorMessage } from '@/lib/error-message'
import { ReportFilters } from '@/features/reports/components/report-filters'
import { defaultReportRange } from '@/features/reports/report-range'
import { BreakdownChips, SummaryCards } from '@/features/reports/components/summary-cards'
import {
  useCentralStockReport,
  type CentralStockReportView,
} from '@/features/reports/use-reports'
import { useItems } from '@/features/items/use-items'
import type {
  CentralStockReportRow,
  CentralStockReportSummary,
  CentralStockTransactionReportRow,
  CentralStockTransactionReportSummary,
} from '@/api/types'

/** Sentinel for "any" — Radix Select cannot hold an empty string. */
const ANY = '__any__'

const VIEWS: { value: CentralStockReportView; label: string }[] = [
  { value: 'stock', label: 'Receipts' },
  { value: 'transactions', label: 'Transactions' },
]

function formatNumber(value: number | string | undefined | null): string {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed.toLocaleString() : '—'
}

/** `2026-08-26T12:16:02.447Z` → `26 Aug 2026`. */
function formatDate(iso: string | undefined | null): string {
  if (!iso) return '—'
  const date = new Date(iso)
  return Number.isNaN(date.getTime())
    ? '—'
    : date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
}

/** The stored path is relative, so it only opens once the origin is prefixed. */
function documentHref(path: string | null | undefined): string | null {
  if (!path) return null
  if (path.startsWith('http://') || path.startsWith('https://')) return path
  if (!path.startsWith('/uploads/')) return null
  return `https://petrox.quicko.rw${path}`
}

export function CentralStockReportPage() {
  const permissions = usePermissions()
  const { canRead } = permissions.forModule(PERMISSION_MODULES.centralStockReport)
  const canReadItems = permissions.forModule(PERMISSION_MODULES.items).canRead

  const [view, setView] = useState<CentralStockReportView>('stock')
  const [range] = useState(defaultReportRange)
  const [startDate, setStartDate] = useState(range.from)
  const [endDate, setEndDate] = useState(range.to)
  const [itemId, setItemId] = useState('')

  const { rows: itemRows } = useItems({ enabled: canRead && canReadItems })

  /**
   * ⚠️ Only the dates and `itemId` are sent. These two endpoints silently
   * ignore `bySupplierId`, `byOrderPlanId`, `deportId` and `orderCode` —
   * verified against a non-existent id, which returned every row — so offering
   * those controls here would be offering filters that do nothing.
   */
  const filter = useMemo(
    () => ({
      ...(startDate ? { startDate: `${startDate}T00:00:00.000Z` } : {}),
      ...(endDate ? { endDate: `${endDate}T23:59:59.999Z` } : {}),
      ...(itemId ? { itemId } : {}),
    }),
    [startDate, endDate, itemId],
  )

  const { summary, rows, pagination, isLoading, isFetching, isError, error } =
    useCentralStockReport({ view, filter, enabled: canRead })

  function resetFilters() {
    setStartDate(range.from)
    setEndDate(range.to)
    setItemId('')
  }

  const stockSummary = view === 'stock' ? (summary as CentralStockReportSummary | null) : null
  const txSummary =
    view === 'transactions' ? (summary as CentralStockTransactionReportSummary | null) : null

  const stockColumns: DataTableColumn<CentralStockReportRow>[] = [
    {
      header: 'Item',
      cell: (row) => (
        <div>
          <span className="font-medium">{row.item?.name ?? '—'}</span>
          {row.item?.baseUnit?.code && (
            <span className="block text-xs text-muted-foreground">
              {row.item.baseUnit.code}
            </span>
          )}
        </div>
      ),
    },
    {
      header: 'Deport',
      cell: (row) => (
        <div>
          <span className="text-sm">{row.deport?.name ?? '—'}</span>
          <span className="block text-xs text-muted-foreground">
            {row.deport?.location ?? ''}
            {row.t1Validation?.exportingCountry
              ? ` · via ${row.t1Validation.exportingCountry}`
              : ''}
          </span>
        </div>
      ),
    },
    {
      header: 'Received',
      className: 'text-right',
      cell: (row) => (
        <div className="tabular-nums">
          <span className="font-medium">{formatNumber(row.quantityAt20C)}</span>
          <span className="block text-xs text-muted-foreground">
            at 20&nbsp;°C · {formatNumber(row.ambQuantity)} ambient
          </span>
        </div>
      ),
    },
    {
      header: 'Loss / gain',
      className: 'text-right',
      // Against the allowance it was received under — a loss beyond tolerance
      // is the figure this report exists to surface.
      cell: (row) => {
        const loss = Number(row.lossQty)
        const gain = Number(row.gainQty)
        const tolerance = Number(row.toleranceRate)
        const over = Number.isFinite(loss) && Number.isFinite(tolerance) && loss > tolerance
        if (!Number.isFinite(loss) && !Number.isFinite(gain)) {
          return <span className="text-muted-foreground">—</span>
        }
        return (
          <div className="tabular-nums">
            {Number.isFinite(loss) && loss > 0 && (
              <span className={over ? 'font-medium text-destructive' : 'font-medium'}>
                −{formatNumber(loss)}
              </span>
            )}
            {Number.isFinite(gain) && gain > 0 && (
              <span className="font-medium">+{formatNumber(gain)}</span>
            )}
            <span className="block text-xs text-muted-foreground">
              {Number.isFinite(tolerance) ? `tolerance ${formatNumber(tolerance)}` : ''}
              {over ? ' · over' : ''}
            </span>
          </div>
        )
      },
    },
    {
      header: 'Status',
      cell: (row) => (
        <Badge variant="outline" className="font-normal">
          {row.status}
        </Badge>
      ),
    },
    {
      header: 'Received on',
      cell: (row) => (
        <span className="text-sm text-muted-foreground">{formatDate(row.createdAt)}</span>
      ),
    },
    {
      header: 'Doc',
      className: 'text-right',
      cell: (row) => {
        const href = documentHref(row.supportingDocUrl)
        return href ? (
          <a
            href={href}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 text-xs text-primary underline-offset-2 hover:underline"
          >
            <FileText className="size-3.5" />
            View
          </a>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        )
      },
    },
  ]

  const transactionColumns: DataTableColumn<CentralStockTransactionReportRow>[] = [
    {
      header: 'Type',
      cell: (row) => (
        <Badge variant="outline" className="font-normal">
          {row.type}
        </Badge>
      ),
    },
    {
      header: 'Item',
      cell: (row) => (
        <div>
          <span className="font-medium">{row.centralStock?.item?.name ?? '—'}</span>
          <span className="block text-xs text-muted-foreground">
            {row.centralStock?.deport?.name ?? ''}
            {row.centralStock?.deport?.location
              ? ` · ${row.centralStock.deport.location}`
              : ''}
          </span>
        </div>
      ),
    },
    {
      header: 'Quantity',
      className: 'text-right',
      cell: (row) => (
        <span className="font-medium tabular-nums">{formatNumber(row.quantity)}</span>
      ),
    },
    {
      header: 'By',
      cell: (row) => (
        <span className="text-sm text-muted-foreground">
          {row.createdBy ? `${row.createdBy.firstName} ${row.createdBy.lastName}` : '—'}
        </span>
      ),
    },
    {
      header: 'When',
      cell: (row) => (
        <span className="text-sm text-muted-foreground">{formatDate(row.createdAt)}</span>
      ),
    },
    {
      header: 'Note',
      cell: (row) =>
        row.note ? (
          <span className="text-sm">{row.note}</span>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        ),
    },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight">
          Central stock report
        </h1>
        <p className="text-sm text-muted-foreground">
          What was received into central stock over a period, and every movement against it.
        </p>
      </div>

      {!canRead ? (
        <NoAccess resource="the central stock report" />
      ) : isError && errorCode(error) === 'FORBIDDEN' ? (
        <NoAccess
          resource="the central stock report"
          variant="rejected"
          permission="central.stock.report.read"
        />
      ) : (
        <>
          <ReportFilters
            startDate={startDate}
            endDate={endDate}
            onStartDateChange={setStartDate}
            onEndDateChange={setEndDate}
            onReset={resetFilters}
          >
            {canReadItems && (
              <div className="grid gap-1.5">
                <Label className="text-xs">Item</Label>
                <Select value={itemId || ANY} onValueChange={(v) => setItemId(v === ANY ? '' : v)}>
                  <SelectTrigger className="h-9 w-40">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ANY}>Any item</SelectItem>
                    {itemRows.map((item) => (
                      <SelectItem key={item.id} value={item.id}>
                        {item.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </ReportFilters>

          {view === 'stock' ? (
            <>
              <SummaryCards
                cards={[
                  { label: 'Receipts', value: stockSummary?.stockCount },
                  {
                    label: 'Received',
                    value: stockSummary?.totalQuantityAt20C,
                    hint: stockSummary
                      ? `at 20 °C · ${Number(stockSummary.totalAmbientQuantity).toLocaleString()} ambient`
                      : undefined,
                  },
                  { label: 'Loss', value: stockSummary?.totalLoss, hint: 'across the period' },
                  {
                    label: 'Balance',
                    value: stockSummary?.currentTransactionBalance,
                    hint: `gain ${formatNumber(stockSummary?.totalGain)}`,
                  },
                ]}
              />
              <BreakdownChips
                label="Transactions by type"
                entries={stockSummary?.transactionsByType}
              />
            </>
          ) : (
            <>
              <SummaryCards
                cards={[{ label: 'Transactions', value: txSummary?.transactionCount }]}
              />
              <BreakdownChips label="By type" entries={txSummary?.byType} />
            </>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap gap-1 rounded-md border bg-muted/30 p-1">
              {VIEWS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setView(option.value)}
                  className={
                    view === option.value
                      ? 'rounded px-3 py-1.5 text-sm font-medium bg-background shadow-sm'
                      : 'rounded px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground'
                  }
                >
                  {option.label}
                </button>
              ))}
            </div>

            <span className="text-xs text-muted-foreground">
              {isFetching && !isLoading ? 'Updating…' : null}
              {pagination ? ` ${pagination.total} in total` : ''}
            </span>
          </div>

          {isError ? (
            <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {errorMessage(error)}
            </p>
          ) : view === 'stock' ? (
            <DataTable
              columns={stockColumns}
              data={rows as CentralStockReportRow[]}
              rowKey={(row) => row.id}
              isLoading={isLoading}
              emptyMessage="Nothing received in this period."
              getSearchText={(row) => `${row.item?.name ?? ''} ${row.deport?.name ?? ''}`}
              searchPlaceholder="Search by item or deport…"
              pageSize={15}
            />
          ) : (
            <DataTable
              columns={transactionColumns}
              data={rows as CentralStockTransactionReportRow[]}
              rowKey={(row) => row.id}
              isLoading={isLoading}
              emptyMessage="No movements in this period."
              getSearchText={(row) =>
                `${row.type} ${row.centralStock?.item?.name ?? ''} ${row.centralStock?.deport?.name ?? ''}`
              }
              searchPlaceholder="Search by type, item or deport…"
              pageSize={15}
            />
          )}
        </>
      )}
    </div>
  )
}
