import { useMemo, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
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
import { useOrderReport, type OrderReportView } from '@/features/reports/use-reports'
import { useSuppliers } from '@/features/suppliers/use-suppliers'
import { useItems } from '@/features/items/use-items'
import { useDeports } from '@/features/deports/use-deports'
import { useOrderPlans } from '@/features/orders/use-order-plans'
import type {
  OrderReportByDeport,
  OrderReportByItem,
  OrderReportByOrderPlan,
  OrderReportBySupplier,
  OrderReportDetail,
} from '@/api/types'

/** Sentinel for "any" — Radix Select cannot hold an empty string. */
const ANY = '__any__'

const VIEWS: { value: OrderReportView; label: string }[] = [
  { value: 'details', label: 'Orders' },
  { value: 'supplier', label: 'By supplier' },
  { value: 'item', label: 'By item' },
  { value: 'deport', label: 'By deport' },
  { value: 'plan', label: 'By order plan' },
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

export function OrderReportPage() {
  const permissions = usePermissions()
  const { canRead } = permissions.forModule(PERMISSION_MODULES.orderReport)
  // Each picker is its own module's data, gated on that module's read.
  const canReadSuppliers = permissions.forModule(PERMISSION_MODULES.suppliers).canRead
  const canReadItems = permissions.forModule(PERMISSION_MODULES.items).canRead
  const canReadDeports = permissions.forModule(PERMISSION_MODULES.deports).canRead
  const canReadPlans = permissions.forModule(PERMISSION_MODULES.orderPlans).canRead

  const [view, setView] = useState<OrderReportView>('details')
  const [range] = useState(defaultReportRange)
  const [startDate, setStartDate] = useState(range.from)
  const [endDate, setEndDate] = useState(range.to)
  const [bySupplierId, setBySupplierId] = useState('')
  const [itemId, setItemId] = useState('')
  const [deportId, setDeportId] = useState('')
  const [byOrderPlanId, setByOrderPlanId] = useState('')
  const [orderCode, setOrderCode] = useState('')

  const { suppliers } = useSuppliers({ enabled: canRead && canReadSuppliers })
  const { rows: itemRows } = useItems({ enabled: canRead && canReadItems })
  const { deports } = useDeports({ enabled: canRead && canReadDeports })
  // ⚠️ The hook returns `plans`, not `orderPlans` — renamed here rather than
  // destructured wrongly, which yields `undefined` and throws on `.map`.
  const { plans: orderPlans } = useOrderPlans({ enabled: canRead && canReadPlans })

  /**
   * Only set filters are sent, and dates are widened to cover the whole day —
   * an end date of `2026-09-16` must include that day's orders, not stop at
   * midnight.
   */
  const filter = useMemo(
    () => ({
      ...(startDate ? { startDate: `${startDate}T00:00:00.000Z` } : {}),
      ...(endDate ? { endDate: `${endDate}T23:59:59.999Z` } : {}),
      ...(bySupplierId ? { bySupplierId } : {}),
      ...(itemId ? { itemId } : {}),
      ...(deportId ? { deportId } : {}),
      ...(byOrderPlanId ? { byOrderPlanId } : {}),
      ...(orderCode.trim() ? { orderCode: orderCode.trim() } : {}),
    }),
    [startDate, endDate, bySupplierId, itemId, deportId, byOrderPlanId, orderCode],
  )

  const { summary, rows, pagination, isLoading, isFetching, isError, error } = useOrderReport({
    view,
    filter,
    enabled: canRead,
  })

  function resetFilters() {
    setStartDate(range.from)
    setEndDate(range.to)
    setBySupplierId('')
    setItemId('')
    setDeportId('')
    setByOrderPlanId('')
    setOrderCode('')
  }

  const detailColumns: DataTableColumn<OrderReportDetail>[] = [
    {
      header: 'Order',
      cell: (row) => (
        <div>
          <span className="font-mono text-sm font-medium">{row.orderCode}</span>
          <span className="block text-xs text-muted-foreground">
            {formatDate(row.orderDate)}
          </span>
        </div>
      ),
    },
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
      header: 'Supplier',
      cell: (row) => (
        <div>
          <span className="text-sm">{row.supplier?.name ?? '—'}</span>
          {row.supplier?.supplierType?.type && (
            <span className="block text-xs text-muted-foreground">
              {row.supplier.supplierType.type}
            </span>
          )}
        </div>
      ),
    },
    {
      header: 'Plan',
      cell: (row) => <span className="text-sm">{row.plan?.name ?? '—'}</span>,
    },
    {
      header: 'Ordered',
      className: 'text-right',
      cell: (row) => (
        <span className="font-medium tabular-nums">{formatNumber(row.quantity)}</span>
      ),
    },
    {
      header: 'Cargos',
      className: 'text-right',
      // The shipments raised against the order, and what actually arrived —
      // the figure that matters against what was ordered.
      cell: (row) => {
        const cargos = row.cargos ?? []
        if (cargos.length === 0) return <span className="text-muted-foreground">—</span>
        const received = cargos.reduce((sum, c) => sum + Number(c.quantityAt20C || 0), 0)
        return (
          <div className="tabular-nums">
            <span className="font-medium">{formatNumber(received)}</span>
            <span className="block text-xs text-muted-foreground">
              at 20&nbsp;°C · {cargos.length} {cargos.length === 1 ? 'cargo' : 'cargos'}
            </span>
          </div>
        )
      },
    },
  ]

  const supplierColumns: DataTableColumn<OrderReportBySupplier>[] = [
    {
      header: 'Supplier',
      cell: (row) => (
        <div>
          <span className="font-medium">{row.name}</span>
          <span className="block text-xs text-muted-foreground">
            {row.supplierType?.type ?? '—'}
            {row.tinNumber ? ` · TIN ${row.tinNumber}` : ''}
          </span>
        </div>
      ),
    },
    {
      header: 'Contact',
      cell: (row) => (
        <span className="text-sm text-muted-foreground">
          {row.phone ?? row.address ?? '—'}
        </span>
      ),
    },
    {
      header: 'Orders',
      className: 'text-right',
      cell: (row) => <span className="tabular-nums">{formatNumber(row.totalOrders)}</span>,
    },
    {
      header: 'Ordered',
      className: 'text-right',
      cell: (row) => (
        <span className="font-medium tabular-nums">{formatNumber(row.orderedQuantity)}</span>
      ),
    },
    {
      header: 'Received',
      className: 'text-right',
      // Shown against what was ordered, since the gap is the point of the report.
      cell: (row) => {
        const ordered = Number(row.orderedQuantity)
        const received = Number(row.receivedQuantityAt20C)
        const short = Number.isFinite(ordered) && Number.isFinite(received) && received < ordered
        return (
          <div className="tabular-nums">
            <span className="font-medium">{formatNumber(received)}</span>
            <span className="block text-xs text-muted-foreground">
              at 20&nbsp;°C
              {short ? ` · ${formatNumber(ordered - received)} short` : ''}
            </span>
          </div>
        )
      },
    },
  ]

  const itemColumns: DataTableColumn<OrderReportByItem>[] = [
    {
      header: 'Item',
      cell: (row) => (
        <div>
          <span className="font-medium">{row.name}</span>
          {row.baseUnit?.code && (
            <span className="block text-xs text-muted-foreground">{row.baseUnit.code}</span>
          )}
        </div>
      ),
    },
    {
      header: 'Tolerance',
      cell: (row) => {
        const rate = (row.toleranceRates ?? []).find((r) => r.status !== 'inactive')
        return rate ? (
          <span className="tabular-nums">{formatNumber(rate.maxRate)}</span>
        ) : (
          <span className="text-muted-foreground">—</span>
        )
      },
    },
    {
      header: 'Orders',
      className: 'text-right',
      cell: (row) => <span className="tabular-nums">{formatNumber(row.totalOrders)}</span>,
    },
    {
      header: 'Ordered',
      className: 'text-right',
      cell: (row) => (
        <span className="font-medium tabular-nums">{formatNumber(row.orderedQuantity)}</span>
      ),
    },
    {
      header: 'Received',
      className: 'text-right',
      cell: (row) =>
        row.receivedQuantityAt20C !== undefined ? (
          <div className="tabular-nums">
            <span className="font-medium">{formatNumber(row.receivedQuantityAt20C)}</span>
            <span className="block text-xs text-muted-foreground">at 20&nbsp;°C</span>
          </div>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
  ]

  const deportColumns: DataTableColumn<OrderReportByDeport>[] = [
    {
      header: 'Deport',
      cell: (row) => (
        <div>
          <span className="font-medium">{row.name}</span>
          <span className="block text-xs text-muted-foreground">
            {row.location ?? '—'}
            {row.type ? ` · ${row.type}` : ''}
          </span>
        </div>
      ),
    },
    {
      header: 'Cargos',
      className: 'text-right',
      cell: (row) => <span className="tabular-nums">{formatNumber(row.totalCargos)}</span>,
    },
    {
      header: 'Ambient',
      className: 'text-right',
      cell: (row) => (
        <span className="tabular-nums">{formatNumber(row.ambientQuantity)}</span>
      ),
    },
    {
      header: 'At 20 °C',
      className: 'text-right',
      cell: (row) => (
        <span className="font-medium tabular-nums">{formatNumber(row.quantityAt20C)}</span>
      ),
    },
    {
      header: 'By status',
      cell: (row) => {
        const entries = Object.entries(row.cargosByStatus ?? {})
        if (entries.length === 0) return <span className="text-muted-foreground">—</span>
        return (
          <div className="flex flex-wrap gap-1">
            {entries.map(([status, count]) => (
              <Badge key={status} variant="outline" className="font-normal">
                {status} {count}
              </Badge>
            ))}
          </div>
        )
      },
    },
  ]

  const planColumns: DataTableColumn<OrderReportByOrderPlan>[] = [
    {
      header: 'Plan',
      cell: (row) => (
        <div>
          <span className="font-medium">{row.name}</span>
          <span className="block text-xs text-muted-foreground">
            {formatDate(row.startDate)} — {formatDate(row.endDate)}
          </span>
        </div>
      ),
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
      header: 'Orders',
      className: 'text-right',
      cell: (row) => <span className="tabular-nums">{formatNumber(row.totalOrders)}</span>,
    },
    {
      header: 'Ordered',
      className: 'text-right',
      cell: (row) => (
        <span className="font-medium tabular-nums">{formatNumber(row.orderedQuantity)}</span>
      ),
    },
  ]

  /*
   * One table per grouping. The casts are safe because `view` selects both the
   * columns and the rows from the same branch — the hook returns whatever that
   * endpoint gave, and only this switch decides how to read it.
   */
  function renderTable() {
    const common = {
      isLoading,
      emptyMessage: 'Nothing in this period. Widen the dates or clear a filter.',
      pageSize: 15,
    }
    switch (view) {
      case 'supplier':
        return (
          <DataTable
            {...common}
            columns={supplierColumns}
            data={rows as OrderReportBySupplier[]}
            rowKey={(row) => row.id}
            getSearchText={(row) => `${row.name} ${row.tinNumber ?? ''}`}
            searchPlaceholder="Search suppliers…"
          />
        )
      case 'item':
        return (
          <DataTable
            {...common}
            columns={itemColumns}
            data={rows as OrderReportByItem[]}
            rowKey={(row) => row.id}
            getSearchText={(row) => row.name}
            searchPlaceholder="Search items…"
          />
        )
      case 'deport':
        return (
          <DataTable
            {...common}
            columns={deportColumns}
            data={rows as OrderReportByDeport[]}
            rowKey={(row) => row.id}
            getSearchText={(row) => `${row.name} ${row.location ?? ''}`}
            searchPlaceholder="Search deports…"
          />
        )
      case 'plan':
        return (
          <DataTable
            {...common}
            columns={planColumns}
            data={rows as OrderReportByOrderPlan[]}
            rowKey={(row) => row.id}
            getSearchText={(row) => row.name}
            searchPlaceholder="Search plans…"
          />
        )
      default:
        return (
          <DataTable
            {...common}
            columns={detailColumns}
            data={rows as OrderReportDetail[]}
            rowKey={(row) => row.id}
            getSearchText={(row) =>
              `${row.orderCode} ${row.item?.name ?? ''} ${row.supplier?.name ?? ''}`
            }
            searchPlaceholder="Search by code, item or supplier…"
            // The cargos behind each order, which the row only totals.
            renderExpanded={(row) => {
              const cargos = row.cargos ?? []
              if (cargos.length === 0) return null
              return (
                <div className="grid gap-2 px-4 py-3">
                  <p className="text-xs font-medium text-muted-foreground">
                    {cargos.length} {cargos.length === 1 ? 'cargo' : 'cargos'}
                  </p>
                  {cargos.map((cargo) => (
                    <div
                      key={cargo.id}
                      className="flex flex-wrap items-baseline justify-between gap-3 rounded-md border bg-background px-3 py-2"
                    >
                      <div className="min-w-40">
                        <span className="text-sm font-medium">{cargo.vesselName}</span>
                        <span className="block text-xs text-muted-foreground">
                          BL {cargo.blRef ?? '—'}
                          {cargo.deport?.name ? ` · ${cargo.deport.name}` : ''}
                        </span>
                      </div>
                      <div className="text-right tabular-nums">
                        <span className="text-sm font-medium">
                          {formatNumber(cargo.quantityAt20C)}
                        </span>
                        <span className="block text-xs text-muted-foreground">
                          at 20&nbsp;°C · {formatNumber(cargo.ambQuantity)} ambient
                        </span>
                      </div>
                      <div className="text-right">
                        <Badge variant="outline" className="font-normal">
                          {cargo.status}
                        </Badge>
                        <span className="block text-xs text-muted-foreground">
                          {formatDate(cargo.receivedDate)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )
            }}
          />
        )
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight">Order report</h1>
        <p className="text-sm text-muted-foreground">
          Orders and the cargo raised against them, over a period. The totals cover every
          matching order, not just the page below.
        </p>
      </div>

      {!canRead ? (
        <NoAccess resource="the order report" />
      ) : isError && errorCode(error) === 'FORBIDDEN' ? (
        <NoAccess
          resource="the order report"
          variant="rejected"
          permission="order.report.read"
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
            {canReadSuppliers && (
              <div className="grid gap-1.5">
                <Label className="text-xs">Supplier</Label>
                <Select
                  value={bySupplierId || ANY}
                  onValueChange={(v) => setBySupplierId(v === ANY ? '' : v)}
                >
                  <SelectTrigger className="h-9 w-44">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ANY}>Any supplier</SelectItem>
                    {suppliers.map((supplier) => (
                      <SelectItem key={supplier.id} value={supplier.id}>
                        {supplier.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

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

            {canReadDeports && (
              <div className="grid gap-1.5">
                <Label className="text-xs">Deport</Label>
                <Select
                  value={deportId || ANY}
                  onValueChange={(v) => setDeportId(v === ANY ? '' : v)}
                >
                  <SelectTrigger className="h-9 w-40">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ANY}>Any deport</SelectItem>
                    {deports.map((deport) => (
                      <SelectItem key={deport.id} value={deport.id}>
                        {deport.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {canReadPlans && (
              <div className="grid gap-1.5">
                <Label className="text-xs">Order plan</Label>
                <Select
                  value={byOrderPlanId || ANY}
                  onValueChange={(v) => setByOrderPlanId(v === ANY ? '' : v)}
                >
                  <SelectTrigger className="h-9 w-40">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ANY}>Any plan</SelectItem>
                    {orderPlans.map((plan) => (
                      <SelectItem key={plan.id} value={plan.id}>
                        {plan.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="grid gap-1.5">
              <Label htmlFor="orderCode" className="text-xs">
                Order code
              </Label>
              <Input
                id="orderCode"
                className="h-9 w-44"
                placeholder="ORD-…"
                value={orderCode}
                onChange={(event) => setOrderCode(event.target.value)}
              />
            </div>
          </ReportFilters>

          <SummaryCards
            cards={[
              { label: 'Orders', value: summary?.totalOrders },
              { label: 'Ordered', value: summary?.totalOrderedQuantity },
              { label: 'Cargos', value: summary?.totalCargos },
              {
                label: 'Received',
                value: summary?.totalCargoQuantityAt20C,
                hint: summary
                  ? `at 20 °C · ${Number(summary.totalCargoAmbientQuantity).toLocaleString()} ambient`
                  : undefined,
              },
            ]}
          />

          <BreakdownChips label="Cargos by status" entries={summary?.cargosByStatus} />

          <div className="flex flex-wrap items-center justify-between gap-3">
            {/* The grouping. Each is a separate endpoint returning the same
                summary, so switching re-groups the detail without changing
                the totals above. */}
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
          ) : (
            renderTable()
          )}
        </>
      )}
    </div>
  )
}
