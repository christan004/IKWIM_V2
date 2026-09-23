import { useMemo, useState } from 'react'
import { ChevronRight, Download, Plus, RotateCcw, Truck } from 'lucide-react'
import { toast } from 'sonner'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { DataTable, type DataTableColumn } from '@/components/data-table'
import { NoAccess } from '@/components/no-access'
import { PERMISSION_MODULES, usePermissions } from '@/hooks/use-permissions'
import { usePosition } from '@/hooks/use-position'
import { StockoutOrderFormDialog } from '@/features/stockout-orders/components/stockout-order-form-dialog'
import { LoadingOrderDialog } from '@/features/stockout-orders/components/loading-order-dialog'
import { ReceiveOrderDialog } from '@/features/stockout-orders/components/receive-order-dialog'
import {
  useReceptionOrders,
  useSetStockoutOrderStatus,
  useStockoutOrders,
} from '@/features/stockout-orders/use-stockout-orders'
import { errorCode, errorMessage } from '@/lib/error-message'
import {
  STOCKOUT_ORDER_STATUSES,
  type ReceptionOrder,
  type StockoutOrder,
  type StockoutOrderStatus,
} from '@/api/types'

/** `2026-08-26` — a date input's value for an instant. */
function toDateInput(date: Date): string {
  return date.toISOString().slice(0, 10)
}

/**
 * The range the page opens on: the last twelve months through today.
 *
 * 🔴 Not a cosmetic default. `GET /stock-out-orders` returns **nothing** unless
 * `startDate` is set — see `StockoutOrderFilter` — so opening unfiltered would
 * show an empty table however many orders exist.
 */
function defaultRange() {
  const to = new Date()
  const from = new Date(to)
  from.setFullYear(from.getFullYear() - 1)
  return { from: toDateInput(from), to: toDateInput(to) }
}

/** Quantities and prices may arrive as strings, so both are parsed. */
function formatNumber(value: number | string | undefined | null): string {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed.toLocaleString() : '—'
}

/** `2026-08-26T12:16:02.447Z` → `26 Aug 2026`. */
function formatDate(iso: string | undefined | null): string {
  if (!iso) return '—'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
}

/** Reads better than the raw `b2b` code. */
const ORDER_TYPE_LABELS: Record<string, string> = { internal: 'Internal', b2b: 'B2B' }

const STATUS_VARIANT: Record<string, 'default' | 'secondary' | 'outline' | 'destructive'> = {
  approved: 'default',
  pending: 'outline',
  rejected: 'destructive',
  cancelled: 'destructive',
}

const STATUS_LABEL: Record<StockoutOrderStatus, string> = {
  pending: 'Pending',
  approved: 'Approved',
  rejected: 'Rejected',
  cancelled: 'Cancelled',
}

/**
 * Which decisions are worth confirming.
 *
 * Approving releases the stock and the other two close the order, so all three
 * are acted on elsewhere — only returning something to `pending` is cheap
 * enough to do without a prompt.
 */
const CONFIRMED: StockoutOrderStatus[] = ['approved', 'rejected', 'cancelled']

/**
 * Whether a load can still be received into a cuve.
 *
 * Gated on the **authorisation chain**, not the load's own `status`: the two
 * move independently, and it is the sign-off that makes a load receivable. A
 * load already fully received has nothing left to take.
 */
function awaitingReception(order: ReceptionOrder | undefined): boolean {
  if (!order) return false
  const authorised = (order.authorizationStatus ?? '').toLowerCase()
  if (authorised !== 'approved' && authorised !== 'authorized') return false
  const reception = (order.receptionStatus ?? '').toLowerCase()
  if (reception === 'received' || reception === 'completed') return false
  // Falls back to the total: a load with nothing received owes all of it.
  const remaining = Number(order.remainingQuantity ?? order.totalQuantity)
  return !Number.isFinite(remaining) || remaining > 0
}

/** One figure from the API's own summary. */
function SummaryTile({
  label,
  value,
  hint,
}: {
  label: string
  value: string
  hint?: string
}) {
  return (
    <div className="rounded-md border px-3 py-2">
      <span className="text-xs text-muted-foreground">{label}</span>
      <p className="text-lg font-semibold tabular-nums">{value}</p>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  )
}

export function StockoutOrdersPage() {
  const permissions = usePermissions()
  // Dotted module code — `stockout.orders`, not `stockout_orders`.
  /*
   * A site manager runs a forecourt: they receive deliveries into their cuves,
   * but moving an order through approved/cancelled is a head-office decision.
   *
   * ⚠️ **A product rule, not a security boundary.** Unlike the receive route —
   * which the API itself refuses to anyone but a site manager — the status
   * route enforces no position, so this only decides what is *offered*.
   */
  const { isSiteManager } = usePosition()
  const { canRead, canCreate, canEdit } = permissions.forModule(
    PERMISSION_MODULES.stockoutOrders,
  )
  // Each shared query is gated on its own module's permission.
  const canReadItems = permissions.forModule(PERMISSION_MODULES.items).canRead
  const canReadUnits = permissions.forModule(PERMISSION_MODULES.units).canRead
  const canReadSites = permissions.forModule(PERMISSION_MODULES.pss).canRead
  // Loading orders are their own module, with their own `loading.orders.*`
  // permissions despite the nested route.
  const canCreateLoading = permissions.forModule(PERMISSION_MODULES.loadingOrders).canCreate
  const canReadDrivers = permissions.forModule(PERMISSION_MODULES.drivers).canRead
  /** The receive dialog's cuve picker is its own module's data. */
  const canReadCuves = permissions.forModule(PERMISSION_MODULES.cuve).canRead
  const canReadVehicles = permissions.forModule(PERMISSION_MODULES.vehicles).canRead

  const [range] = useState(defaultRange)
  const [startDate, setStartDate] = useState(range.from)
  const [endDate, setEndDate] = useState(range.to)

  /**
   * Only set filters are sent — each is validated when present, so `startDate=`
   * returns `400` rather than meaning "no filter". Dates are widened to cover
   * the whole day, as elsewhere.
   */
  const filter = useMemo(
    () => ({
      ...(startDate ? { startDate: `${startDate}T00:00:00.000Z` } : {}),
      ...(endDate ? { endDate: `${endDate}T23:59:59.999Z` } : {}),
    }),
    [startDate, endDate],
  )

  const isDefaultRange = startDate === range.from && endDate === range.to

  const { orders, summary, breakdowns, isLoading, isError, error } = useStockoutOrders({
    enabled: canRead,
    filter,
  })

  /*
   * The loads carrying these orders, with their reception figures.
   *
   * A stockout order carries **no reference to its loading order** — the link
   * only exists in the other direction, as `loadedOrders[].order.id` — so the
   * load is found by searching this list rather than read off the row.
   *
   * Fetched only for a site manager, since they are the only ones who may
   * receive; the API refuses everyone else outright.
   */
  const { receptionOrders } = useReceptionOrders({ enabled: canRead && isSiteManager })

  /** The load carrying this order, if any is still awaiting reception. */
  const receptionForOrder = (orderId: string): ReceptionOrder | undefined =>
    receptionOrders.find((load) =>
      (load.loadedOrders ?? []).some((line) => line.order?.id === orderId),
    )

  const [createOpen, setCreateOpen] = useState(false)
  const [loadingOpen, setLoadingOpen] = useState(false)
  /** The load being received into a cuve. */
  const [receiving, setReceiving] = useState<ReceptionOrder | null>(null)
  /** Which row is mid-request, so its control cannot be driven twice. */
  const [savingId, setSavingId] = useState<string | null>(null)
  /** A decision awaiting confirmation. */
  const [pendingChange, setPendingChange] = useState<{
    order: StockoutOrder
    status: StockoutOrderStatus
  } | null>(null)

  const setStatus = useSetStockoutOrderStatus()

  function applyStatus(order: StockoutOrder, status: StockoutOrderStatus) {
    setSavingId(order.id)
    setStatus.mutate(
      { id: order.id, status },
      {
        onSuccess: () => {
          toast.success(`Order ${STATUS_LABEL[status].toLowerCase()}`)
          setPendingChange(null)
        },
        onError: (err) => toast.error(errorMessage(err)),
        onSettled: () => setSavingId(null),
      },
    )
  }

  /** Confirms the decisions that commit, applies the rest straight away. */
  function requestStatusChange(order: StockoutOrder, status: StockoutOrderStatus) {
    if (status === order.status) return
    if (CONFIRMED.includes(status)) {
      setPendingChange({ order, status })
      return
    }
    applyStatus(order, status)
  }

  const columns: DataTableColumn<StockoutOrder>[] = [
    {
      header: 'Item',
      // The item now comes from the central stock the order draws on — there is
      // no top-level `item` or `itemId` on a row any more.
      cell: (row) => {
        const item = row.centralStock?.item
        const code = item?.baseUnit?.code
        return (
          <div className="flex items-center gap-2">
            <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" />
            {item ? (
              <div>
                <span className="font-medium">{item.name}</span>
                {code && <span className="block text-xs text-muted-foreground">in {code}</span>}
              </div>
            ) : (
              <span className="text-muted-foreground">—</span>
            )}
          </div>
        )
      },
    },
    {
      header: 'Quantity',
      cell: (row) => {
        const code = row.centralStock?.item?.baseUnit?.code
        return (
          <span className="font-medium tabular-nums">
            {formatNumber(row.quantity)}
            {code && <span className="ml-1 text-xs font-normal text-muted-foreground">{code}</span>}
          </span>
        )
      },
    },
    {
      header: 'Unit price',
      cell: (row) => <span className="tabular-nums">{formatNumber(row.unitPrice)}</span>,
    },
    {
      header: 'Total',
      // The API computes this now, so it is read rather than re-derived —
      // recomputing risks disagreeing with the summary above.
      cell: (row) => (
        <span className="font-medium tabular-nums">{formatNumber(row.totalPrice)}</span>
      ),
    },
    {
      header: 'Destination',
      // A b2b order has no site, which is expected rather than missing data.
      cell: (row) =>
        row.site ? (
          <div>
            <span className="text-sm">{row.site.name}</span>
            {row.site.address && (
              <span className="block text-xs text-muted-foreground">{row.site.address}</span>
            )}
          </div>
        ) : (
          <span className="text-xs text-muted-foreground">
            {row.orderType === 'b2b' ? 'External buyer' : '—'}
          </span>
        ),
    },
    {
      header: 'Type',
      cell: (row) =>
        row.orderType ? (
          <Badge variant="secondary" className="font-normal">
            {ORDER_TYPE_LABELS[row.orderType] ?? row.orderType}
          </Badge>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        ),
    },
    ...(isSiteManager
      ? [
          {
            header: '',
            className: 'text-right',
            /*
             * Receiving is site-manager only — the API refuses anyone else with
             * a plain `403`, so this column exists only for them. It shows once
             * the load carrying this order has been authorised.
             */
            cell: (row: StockoutOrder) => {
              const load = receptionForOrder(row.id)
              if (!awaitingReception(load)) {
                return <span className="text-xs text-muted-foreground">—</span>
              }
              return (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={(event) => {
                    // The row expands on click, so the button must not toggle it.
                    event.stopPropagation()
                    setReceiving(load ?? null)
                  }}
                >
                  <Download className="size-3.5" />
                  Receive
                </Button>
              )
            },
          },
        ]
      : []),
    {
      header: 'Status',
      cell: (row) => {
        const approver = row.approvedUser && (
          <span className="block text-xs text-muted-foreground">
            by {row.approvedUser.firstName} {row.approvedUser.lastName}
          </span>
        )

        // Changing status is an edit, and is closed to site managers — see
        // `isSiteManager` above. Either way the state falls back to read-only.
        if (!canEdit || isSiteManager || !row.status) {
          return row.status ? (
            <div>
              <Badge variant={STATUS_VARIANT[row.status] ?? 'outline'} className="font-normal">
                {row.status}
              </Badge>
              {approver}
            </div>
          ) : (
            <span className="text-xs text-muted-foreground">—</span>
          )
        }

        return (
          <div
            // The row expands on click, so the control must not toggle it too.
            onClick={(event) => event.stopPropagation()}
          >
            {/* Four states rather than a boolean, so the status is chosen from
                a list instead of toggled. */}
            <Select
              value={row.status}
              disabled={savingId === row.id}
              onValueChange={(value) =>
                requestStatusChange(row, value as StockoutOrderStatus)
              }
            >
              <SelectTrigger className="h-8 w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STOCKOUT_ORDER_STATUSES.map((status) => (
                  <SelectItem key={status} value={status}>
                    {STATUS_LABEL[status]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {approver}
          </div>
        )
      },
    },
  ]

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight">Stockout orders</h1>
          <p className="text-sm text-muted-foreground">
            Cleared stock going out — to one of your sites, or sold to another business.
            Click an order to see where it came from.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {/* Loading assigns existing orders to a vehicle, so it needs orders
              to work with. */}
          {canCreateLoading && (
            <Button
              variant="outline"
              disabled={orders.length === 0}
              onClick={() => setLoadingOpen(true)}
              title={
                orders.length === 0
                  ? 'No orders in this range to load'
                  : 'Assign orders to a vehicle'
              }
            >
              <Truck />
              Loading order
            </Button>
          )}
          {canCreate && (
            <Button onClick={() => setCreateOpen(true)}>
              <Plus />
              New order
            </Button>
          )}
        </div>
      </div>

      {!canRead ? (
        <NoAccess resource="stockout orders" />
      ) : isError && errorCode(error) === 'FORBIDDEN' ? (
        <NoAccess resource="stockout orders" variant="rejected" permission="stockout.orders.read" />
      ) : isError ? (
        <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {errorMessage(error)}
        </p>
      ) : (
        <>
          <div className="flex flex-wrap items-end gap-3 rounded-md border p-3">
            <div className="grid gap-1.5">
              <Label htmlFor="filter-start" className="text-xs">
                From
              </Label>
              <Input
                id="filter-start"
                type="date"
                className="h-8 w-40"
                value={startDate}
                max={endDate || undefined}
                onChange={(event) => setStartDate(event.target.value)}
              />
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="filter-end" className="text-xs">
                To
              </Label>
              <Input
                id="filter-end"
                type="date"
                className="h-8 w-40"
                value={endDate}
                min={startDate || undefined}
                onChange={(event) => setEndDate(event.target.value)}
              />
            </div>

            {/* Reset, not Clear: clearing `startDate` would return nothing at
                all, so the default range is the meaningful "no filter". */}
            {!isDefaultRange && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setStartDate(range.from)
                  setEndDate(range.to)
                }}
              >
                <RotateCcw className="size-3.5" />
                Reset
              </Button>
            )}

            <p className="ml-auto text-xs text-muted-foreground">
              Orders raised in this range.
            </p>
          </div>

          {/* The API computes these, so they are shown rather than recomputed
              from the visible rows — which would disagree once the list is
              filtered or paged. */}
          {summary && summary.orderCount > 0 && (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <SummaryTile
                label="Orders"
                value={formatNumber(summary.orderCount)}
                hint={Object.entries(summary.quantitiesByOrderType)
                  .map(([type, qty]) => `${ORDER_TYPE_LABELS[type] ?? type} ${formatNumber(qty)}`)
                  .join(' · ')}
              />
              <SummaryTile label="Quantity" value={formatNumber(summary.totalQuantity)} />
              <SummaryTile label="Amount" value={formatNumber(summary.totalAmount)} />
              <SummaryTile
                label="Average unit price"
                value={formatNumber(summary.averageUnitPrice)}
              />
            </div>
          )}

          {/* Per-item and per-site totals the API already aggregates. */}
          {(breakdowns.items.length > 0 || breakdowns.sites.length > 0) && (
            <div className="grid gap-3 md:grid-cols-2">
              {breakdowns.items.length > 0 && (
                <div className="rounded-md border p-3">
                  <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    By item
                  </p>
                  <div className="grid gap-1.5">
                    {breakdowns.items.map((row) => (
                      <div
                        key={row.item.id}
                        className="flex flex-wrap items-baseline justify-between gap-2 text-sm"
                      >
                        <span className="font-medium">{row.item.name}</span>
                        <span className="tabular-nums text-muted-foreground">
                          {formatNumber(row.quantity)}
                          {row.item.baseUnit?.code ? ` ${row.item.baseUnit.code}` : ''} ·{' '}
                          {formatNumber(row.amount)} ·{' '}
                          {row.orderCount} {row.orderCount === 1 ? 'order' : 'orders'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {breakdowns.sites.length > 0 && (
                <div className="rounded-md border p-3">
                  <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    By site
                  </p>
                  <div className="grid gap-1.5">
                    {breakdowns.sites.map((row) => (
                      <div
                        key={row.site.id}
                        className="flex flex-wrap items-baseline justify-between gap-2 text-sm"
                      >
                        <span className="font-medium">{row.site.name}</span>
                        <span className="tabular-nums text-muted-foreground">
                          {formatNumber(row.quantity)} · {formatNumber(row.amount)} ·{' '}
                          {row.orderCount} {row.orderCount === 1 ? 'order' : 'orders'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          <DataTable
            columns={columns}
            data={orders}
            rowKey={(row) => row.id}
            isLoading={isLoading}
            emptyMessage={
            isDefaultRange
              ? 'No stockout orders in the last year. Create one to record cleared stock going out.'
              : 'No stockout orders in this range.'
          }
            getSearchText={(row) =>
              `${row.centralStock?.item?.name ?? ''} ${row.site?.name ?? ''} ${
                row.orderType ?? ''
              } ${row.status ?? ''} ${row.user?.firstName ?? ''} ${row.user?.lastName ?? ''}`
            }
            searchPlaceholder="Search orders…"
            pageSize={15}
            /*
             * Where the stock came from — the clearance it was drawn against and
             * the central stock behind it. Too much for a column, but it is the
             * audit trail that makes an order traceable.
             */
            renderExpanded={(row) => (
              <div className="grid gap-3 px-4 py-3 md:grid-cols-2">
                <div className="rounded-md border bg-background p-3">
                  <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Drawn from
                  </p>
                  {row.centralStock ? (
                    <div className="grid gap-0.5 text-sm">
                      <span className="font-medium">
                        {row.centralStock.item?.name ?? 'Central stock'}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {/* Spelled `deport` here, unlike central stock's own
                            `depot` — the two endpoints disagree. */}
                        {row.centralStock.deport?.name ?? '—'}
                        {row.centralStock.deport?.type ? ` · ${row.centralStock.deport.type}` : ''}
                      </span>
                      {row.centralStock.t1Validation && (
                        <span className="text-xs text-muted-foreground">
                          via {row.centralStock.t1Validation.exportingCountry}
                        </span>
                      )}
                      <span className="text-xs text-muted-foreground">
                        Receipt held {formatNumber(row.centralStock.quantity)}
                        {row.centralStock.status ? ` · ${row.centralStock.status}` : ''}
                      </span>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">Not recorded.</p>
                  )}
                </div>

                <div className="rounded-md border bg-background p-3">
                  <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Clearance
                  </p>
                  {row.clearance ? (
                    <div className="grid gap-0.5 text-sm">
                      <span className="flex flex-wrap items-center gap-2">
                        <Badge variant="secondary" className="font-normal">
                          {row.clearance.status}
                        </Badge>
                        <span className="tabular-nums font-medium">
                          {formatNumber(row.clearance.quantity)}
                        </span>
                      </span>
                      {row.clearance.agent && (
                        <span className="text-xs text-muted-foreground">
                          via {row.clearance.agent.names}
                        </span>
                      )}
                      <span className="text-xs text-muted-foreground">
                        {formatNumber(row.clearance.amount)}
                        {row.clearance.fees != null
                          ? ` (+${formatNumber(row.clearance.fees)} fees)`
                          : ''}
                      </span>
                      <span className="flex flex-wrap gap-2 text-xs">
                        {row.clearance.supportingDocUrl && (
                          <a
                            href={row.clearance.supportingDocUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="text-primary underline-offset-2 hover:underline"
                          >
                            Doc
                          </a>
                        )}
                        {row.clearance.dmsDocUrl && (
                          <a
                            href={row.clearance.dmsDocUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="text-primary underline-offset-2 hover:underline"
                          >
                            DMS
                          </a>
                        )}
                      </span>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">Not recorded.</p>
                  )}
                </div>

                <div className="text-xs text-muted-foreground md:col-span-2">
                  Raised by {row.user ? `${row.user.firstName} ${row.user.lastName}` : '—'} on{' '}
                  {formatDate(row.createdAt)}
                  {row.approvedAt
                    ? ` · approved ${formatDate(row.approvedAt)}`
                    : ' · not yet approved'}
                </div>
              </div>
            )}
          />
        </>
      )}

      <ConfirmDialog
        open={pendingChange !== null}
        onOpenChange={(open) => {
          if (!open) setPendingChange(null)
        }}
        title={
          pendingChange ? `${STATUS_LABEL[pendingChange.status]} this order?` : ''
        }
        description={
          pendingChange
            ? pendingChange.status === 'approved'
              ? `${formatNumber(pendingChange.order.quantity)} will be released for loading.`
              : `The order will be ${STATUS_LABEL[pendingChange.status].toLowerCase()} and closed.`
            : ''
        }
        confirmLabel={pendingChange ? STATUS_LABEL[pendingChange.status] : 'Confirm'}
        variant={pendingChange?.status === 'approved' ? 'default' : 'destructive'}
        isLoading={setStatus.isPending}
        onConfirm={() => {
          if (pendingChange) applyStatus(pendingChange.order, pendingChange.status)
        }}
      />

      <LoadingOrderDialog
        open={loadingOpen}
        onOpenChange={setLoadingOpen}
        orders={orders}
        canReadDrivers={canReadDrivers}
        canReadVehicles={canReadVehicles}
      />

      <ReceiveOrderDialog
        open={Boolean(receiving)}
        onOpenChange={(open) => !open && setReceiving(null)}
        order={receiving}
        canReadCuves={canReadCuves}
      />

      <StockoutOrderFormDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        canReadItems={canReadItems}
        canReadUnits={canReadUnits}
        canReadSites={canReadSites}
      />
    </div>
  )
}
