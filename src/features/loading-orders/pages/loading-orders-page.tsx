import { useState } from 'react'
import { Check, ChevronRight, Truck } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { DataTable, type DataTableColumn } from '@/components/data-table'
import { NoAccess } from '@/components/no-access'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { PERMISSION_MODULES, usePermissions } from '@/hooks/use-permissions'
import { LoadingOrderDialog } from '@/features/stockout-orders/components/loading-order-dialog'
import {
  useApproveLoadingOrder,
  useLoadingOrders,
  useStockoutOrders,
} from '@/features/stockout-orders/use-stockout-orders'
import { errorCode, errorMessage } from '@/lib/error-message'
import type { LoadingOrder } from '@/api/types'

/**
 * Whether a loading order still needs signing.
 *
 * Approval is the only verb the API offers — there is no reject route — so a
 * chain that is already `approved` or `authorized` has nothing left to do, and
 * one that was rejected or cancelled cannot be revived from here.
 */
function awaitingApproval(order: LoadingOrder): boolean {
  const state = (order.authorizationStatus ?? '').toLowerCase()
  return state === '' || state === 'pending'
}


/** Quantities arrive as strings, so they are parsed before formatting. */
function formatNumber(value: number | string | undefined | null): string {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed.toLocaleString() : '—'
}

/** `2026-08-31T15:36:36.741Z` → `31 Aug 2026`. */
function formatDate(iso: string | undefined | null): string {
  if (!iso) return '—'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
}

const STATUS_VARIANT: Record<string, 'default' | 'secondary' | 'outline' | 'destructive'> = {
  approved: 'default',
  authorized: 'default',
  pending: 'outline',
  rejected: 'destructive',
  cancelled: 'destructive',
}

/**
 * The date range the stockout-orders list needs to return anything.
 *
 * 🔴 `GET /stock-out-orders` gives nothing without a `startDate` — see
 * `StockoutOrderFilter`. The loading dialog needs those orders to offer, so the
 * same workaround applies here.
 */
function defaultRange() {
  const to = new Date()
  const from = new Date(to)
  from.setFullYear(from.getFullYear() - 1)
  const iso = (d: Date) => d.toISOString().slice(0, 10)
  return {
    startDate: `${iso(from)}T00:00:00.000Z`,
    endDate: `${iso(to)}T23:59:59.999Z`,
  }
}

export function LoadingOrdersPage() {
  const permissions = usePermissions()
  const { canRead, canCreate, canEdit } = permissions.forModule(PERMISSION_MODULES.loadingOrders)
  // Each shared query is gated on its own module's permission.
  const canReadOrders = permissions.forModule(PERMISSION_MODULES.stockoutOrders).canRead
  const canReadDrivers = permissions.forModule(PERMISSION_MODULES.drivers).canRead
  const canReadVehicles = permissions.forModule(PERMISSION_MODULES.vehicles).canRead

  const { loadingOrders, isLoading, isError, error } = useLoadingOrders({ enabled: canRead })
  // Only to populate the dialog's order picker.
  const [range] = useState(defaultRange)
  const { orders } = useStockoutOrders({
    enabled: canRead && canCreate && canReadOrders,
    filter: range,
  })

  const [createOpen, setCreateOpen] = useState(false)
  /** The loading order awaiting a confirmed approval. */
  const [approving, setApproving] = useState<LoadingOrder | null>(null)
  const approveLoadingOrder = useApproveLoadingOrder()

  function confirmApprove() {
    if (!approving) return
    approveLoadingOrder.mutate(
      { id: approving.id },
      {
        onSuccess: () => {
          toast.success('Loading order approved')
          setApproving(null)
        },
        onError: (err) => toast.error(errorMessage(err)),
      },
    )
  }

  const columns: DataTableColumn<LoadingOrder>[] = [
    {
      header: 'Load',
      // A load can carry several orders, so the row names what is on it rather
      // than a single item.
      cell: (row) => {
        const lines = row.loadedOrders ?? []
        const items = [
          ...new Set(
            lines.map((line) => line.order?.centralStock?.item?.name).filter(Boolean),
          ),
        ]
        return (
          <div className="flex items-center gap-2">
            <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" />
            <div>
              <span className="font-medium">{items.join(', ') || '—'}</span>
              <span className="block text-xs text-muted-foreground">
                {lines.length} {lines.length === 1 ? 'order' : 'orders'}
              </span>
            </div>
          </div>
        )
      },
    },
    {
      header: 'Loading',
      // The whole load against the vehicle's capacity — the ceiling the API
      // applies across every line, not per order.
      cell: (row) => {
        const capacity = Number(row.dVehicle?.vechile?.tankCapacity)
        return (
          <div>
            <span className="font-medium tabular-nums">
              {formatNumber(row.totalQuantity)}
            </span>
            {Number.isFinite(capacity) && (
              <span className="block text-xs text-muted-foreground">
                of {formatNumber(capacity)} capacity
              </span>
            )}
          </div>
        )
      },
    },
    {
      header: 'Driver and vehicle',
      // ⚠️ `dVehicle`, and the vehicle inside it is `vechile`.
      cell: (row) => {
        const driver = row.dVehicle?.driver
        const vehicle = row.dVehicle?.vechile
        if (!driver && !vehicle) return <span className="text-xs text-muted-foreground">—</span>
        return (
          <div>
            <span className="text-sm">{driver?.names ?? '—'}</span>
            {vehicle?.platNumber && (
              <span className="block font-mono text-xs text-muted-foreground">
                {vehicle.platNumber}
              </span>
            )}
          </div>
        )
      },
    },
    {
      header: 'Destination',
      // One load can serve several sites, so every distinct one is named. A
      // b2b order has no site, which is expected rather than missing data.
      cell: (row) => {
        const lines = row.loadedOrders ?? []
        const sites = [
          ...new Set(
            lines.map((line) =>
              line.order?.site?.name ??
              (line.order?.orderType === 'b2b' ? 'External buyer' : null),
            ).filter(Boolean),
          ),
        ]
        return sites.length > 0 ? (
          <span className="text-sm">{sites.join(', ')}</span>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        )
      },
    },
    {
      header: 'Authorisation',
      /*
       * Tracked separately from `status`: a loading order waits on a chain of
       * authorisers, and `authorizers[]` is empty until someone signs. Showing
       * "0 of 3" makes the wait legible rather than looking like no data.
       */
      cell: (row) => {
        const signed = row.authorizers?.length ?? 0
        const required = row.authoriserCount ?? 0
        return (
          <div>
            <Badge
              variant={STATUS_VARIANT[row.authorizationStatus ?? ''] ?? 'outline'}
              className="font-normal"
            >
              {row.authorizationStatus ?? 'unknown'}
            </Badge>
            {required > 0 && (
              <span className="block text-xs text-muted-foreground">
                {signed} of {required} signed
              </span>
            )}
          </div>
        )
      },
    },
    {
      header: 'Status',
      cell: (row) =>
        row.status ? (
          <Badge variant={STATUS_VARIANT[row.status] ?? 'outline'} className="font-normal">
            {row.status}
          </Badge>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        ),
    },
  ]

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight">Loading orders</h1>
          <p className="text-sm text-muted-foreground">
            Stockout orders assigned to a vehicle for loading. Each waits on its authorisation
            chain before the stock moves.
          </p>
        </div>
        {canCreate && (
          <Button
            disabled={orders.length === 0}
            onClick={() => setCreateOpen(true)}
            title={
              orders.length === 0
                ? 'No stockout orders available to load'
                : 'Assign orders to a vehicle'
            }
          >
            <Truck />
            New loading order
          </Button>
        )}
      </div>

      {!canRead ? (
        <NoAccess resource="loading orders" />
      ) : isError && errorCode(error) === 'FORBIDDEN' ? (
        <NoAccess resource="loading orders" variant="rejected" permission="loading.orders.read" />
      ) : isError ? (
        <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {errorMessage(error)}
        </p>
      ) : (
        <DataTable
          columns={columns}
          data={loadingOrders}
          rowKey={(row) => row.id}
          isLoading={isLoading}
          emptyMessage="No loading orders yet. Assign a stockout order to a vehicle to create one."
          getSearchText={(row) =>
            [
              ...(row.loadedOrders ?? []).flatMap((line) => [
                line.order?.centralStock?.item?.name ?? '',
                line.order?.site?.name ?? '',
              ]),
              row.dVehicle?.driver?.names ?? '',
              row.dVehicle?.vechile?.platNumber ?? '',
              row.status ?? '',
              row.authorizationStatus ?? '',
            ].join(' ')
          }
          searchPlaceholder="Search loading orders…"
          pageSize={15}
          /*
           * The orders on this load, and who has signed it. A load groups
           * several orders, so this is a list rather than one record.
           */
          renderExpanded={(row) => (
            <div className="grid gap-3 px-4 py-3 md:grid-cols-2">
              <div className="rounded-md border bg-background p-3">
                <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Orders on this load
                </p>
                {(row.loadedOrders ?? []).length === 0 ? (
                  <p className="text-sm text-muted-foreground">Not recorded.</p>
                ) : (
                  <div className="grid gap-2">
                    {(row.loadedOrders ?? []).map((line) => (
                      <div key={line.id} className="grid gap-0.5 text-sm">
                        <span className="flex flex-wrap items-baseline gap-2">
                          <span className="font-medium tabular-nums">
                            {formatNumber(line.quantity)}
                          </span>
                          <span className="font-medium">
                            {line.order?.centralStock?.item?.name ?? 'Order'}
                          </span>
                          {line.order?.site?.name && (
                            <span className="text-xs text-muted-foreground">
                              → {line.order.site.name}
                            </span>
                          )}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {/* What the order holds, so a partial load is visible. */}
                          of {formatNumber(line.order?.quantity)} ordered ·{' '}
                          {line.order?.orderType ?? '—'} · {line.order?.status ?? '—'}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="rounded-md border bg-background p-3">
                <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Authorisation
                  </p>
                  {canEdit && awaitingApproval(row) && (
                    <Button
                      size="sm"
                      onClick={(event) => {
                        // The group row toggles on click; without this the
                        // panel would collapse under the dialog.
                        event.stopPropagation()
                        setApproving(row)
                      }}
                    >
                      <Check className="size-3.5" />
                      Approve
                    </Button>
                  )}
                </div>
                {(row.authorizers?.length ?? 0) === 0 ? (
                  // Empty is the normal state for a new loading order, not a
                  // fault — it is waiting, not missing data.
                  <p className="text-sm text-muted-foreground">
                    Awaiting {row.authoriserCount ?? 0}{' '}
                    {row.authoriserCount === 1 ? 'authoriser' : 'authorisers'}.
                  </p>
                ) : (
                  <div className="grid gap-0.5">
                    {row.authorizers?.map((authoriser) => (
                      <div
                        key={authoriser.id}
                        className="flex flex-wrap items-baseline gap-2 text-xs"
                      >
                        {authoriser.level !== undefined && (
                          <span className="font-medium tabular-nums">L{authoriser.level}</span>
                        )}
                        <span className="text-muted-foreground">
                          {authoriser.user
                            ? `${authoriser.user.firstName} ${authoriser.user.lastName}`
                            : '—'}
                        </span>
                        {authoriser.status && (
                          <Badge variant="outline" className="font-normal">
                            {authoriser.status}
                          </Badge>
                        )}
                        {authoriser.createdAt && (
                          <span className="text-muted-foreground">
                            {formatDate(authoriser.createdAt)}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="text-xs text-muted-foreground md:col-span-2">
                Created {formatDate(row.createdAt)}
              </div>
            </div>
          )}
        />
      )}

      <LoadingOrderDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        orders={orders}
        canReadDrivers={canReadDrivers}
        canReadVehicles={canReadVehicles}
      />

      <ConfirmDialog
        open={Boolean(approving)}
        onOpenChange={(open) => !open && setApproving(null)}
        title="Approve this loading order?"
        description={
          approving
            ? `${approving.dVehicle?.vechile?.platNumber ?? 'This load'} — ${formatNumber(
                approving.totalQuantity,
              )} across ${approving.loadedOrders?.length ?? 0} ${
                approving.loadedOrders?.length === 1 ? 'order' : 'orders'
              }. Your approval is recorded against the chain and cannot be withdrawn — the API offers no reject.`
            : ''
        }
        confirmLabel="Approve"
        isLoading={approveLoadingOrder.isPending}
        onConfirm={confirmApprove}
      />
    </div>
  )
}
