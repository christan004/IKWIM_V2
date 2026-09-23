import { useState } from 'react'
import { ChevronRight, Pencil, Plus, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
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
import { OrderFormDialog } from '@/features/orders/components/order-form-dialog'
import { useOrders } from '@/features/orders/use-orders'
import { useOrderPlans } from '@/features/orders/use-order-plans'
import { useSuppliers } from '@/features/suppliers/use-suppliers'
import { errorCode, errorMessage } from '@/lib/error-message'
import type { Order } from '@/api/types'

const ALL = '__all__'

/**
 * Formats the UTC calendar day the API stores. Reading local `Date` getters
 * would shift the day for viewers behind UTC.
 */
function formatDate(iso: string): string {
  const [year, month, day] = iso.slice(0, 10).split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString(undefined, {
    timeZone: 'UTC',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

/** `quantity` arrives as a string, so it is parsed before formatting. */
function formatQuantity(quantity: string): string {
  const value = Number(quantity)
  return Number.isFinite(value) ? value.toLocaleString() : quantity
}

export function OrdersPage() {
  const permissions = usePermissions()
  const { canRead, canCreate, canEdit } = permissions.forModule(PERMISSION_MODULES.orders)
  const canReadSuppliers = permissions.forModule(PERMISSION_MODULES.suppliers).canRead
  const canReadPlans = permissions.forModule(PERMISSION_MODULES.orderPlans).canRead

  const [supplierId, setSupplierId] = useState('')
  const [planId, setPlanId] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)

  const { orders, isFiltered, isLoading, isError, error } = useOrders({
    filter: { supplierId, planId },
    enabled: canRead,
  })

  // Filter options come from the features that own them, so they are gated on
  // *their* read permission — not on `orders.read`. These queries share a cache
  // key with the Suppliers and Order plans pages, so disabling them here would
  // leave those screens holding an empty list.
  const { suppliers } = useSuppliers({ enabled: canReadSuppliers })
  const { plans } = useOrderPlans({ enabled: canReadPlans })

  const columns: DataTableColumn<Order>[] = [
    {
      header: 'Order',
      cell: (order) => (
        <div className="flex items-center gap-2">
          {/* A row only expands when it has deliveries, so the chevron marks
              which rows are clickable rather than implying every row is. */}
          <ChevronRight
            className={cn(
              'size-3.5 shrink-0 text-muted-foreground',
              (order.cargos?.length ?? 0) === 0 && 'invisible',
            )}
          />
          <div>
            <code className="font-mono text-xs font-medium">{order.orderCode}</code>
            <span className="block text-xs text-muted-foreground">
              {formatDate(order.orderDate)}
            </span>
          </div>
        </div>
      ),
    },
    {
      header: 'Item',
      cell: (order) => (
        <div>
          <span className="font-medium">{order.item?.name ?? '—'}</span>
          {order.item?.status === 'inactive' && (
            <Badge variant="outline" className="ml-2 text-xs">
              Inactive
            </Badge>
          )}
        </div>
      ),
    },
    {
      header: 'Quantity',
      cell: (order) => (
        <span className="tabular-nums">
          {formatQuantity(order.quantity)}
          {order.item?.baseUnit?.code && (
            <span className="ml-1 text-xs text-muted-foreground">
              {order.item.baseUnit.code}
            </span>
          )}
        </span>
      ),
    },
    {
      header: 'Delivered',
      // `stockCargos` is the **sum** of the nested stock quantities, not a
      // count of cargo records — confirmed against live data.
      cell: (order) => {
        const delivered = Number(order.stockCargos)
        if (!Number.isFinite(delivered) || delivered === 0) {
          return <span className="text-xs text-muted-foreground">—</span>
        }

        // The server's own figure rather than a local subtraction, so the two
        // can never disagree. It is negative when over-delivered.
        const remaining = Number(order.remainingStock)
        const unit = order.item?.baseUnit?.code

        return (
          <div className="tabular-nums">
            <span className="font-medium">{delivered.toLocaleString()}</span>
            {unit && <span className="ml-1 text-xs text-muted-foreground">{unit}</span>}
            {/* Only a difference is worth calling out — an exact match needs
                no second line. */}
            {Number.isFinite(remaining) && remaining > 0 && (
              <span className="block text-xs text-muted-foreground">
                {remaining.toLocaleString()} remaining
              </span>
            )}
            {Number.isFinite(remaining) && remaining < 0 && (
              <span className="block text-xs text-amber-600 dark:text-amber-500">
                {Math.abs(remaining).toLocaleString()} over
              </span>
            )}
          </div>
        )
      },
    },
    {
      header: 'Supplier',
      cell: (order) => (
        <div>
          <span>{order.supplier?.name ?? '—'}</span>
          {order.supplier?.phone && (
            <span className="block text-xs text-muted-foreground">{order.supplier.phone}</span>
          )}
        </div>
      ),
    },
    {
      header: 'Created by',
      cell: (order) =>
        order.createdUser ? (
          <span className="text-sm text-muted-foreground">
            {order.createdUser.firstName} {order.createdUser.lastName}
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    ...(canEdit
      ? [
          {
            header: '',
            className: 'text-right',
            // There is no delete endpoint, so editing is the only correction path.
            cell: (order: Order) => (
              <Button
                variant="ghost"
                size="sm"
                // The row itself toggles the delivery panel, so the click must
                // stop here or editing would expand the row as well.
                onClick={(event) => {
                  event.stopPropagation()
                  setEditId(order.id)
                }}
                title="Edit order"
              >
                <Pencil className="size-3.5" />
              </Button>
            ),
          },
        ]
      : []),
  ]

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight">Orders</h1>
          <p className="text-sm text-muted-foreground">
            Orders placed with suppliers, grouped into order plans.
          </p>
        </div>
        {canCreate && (
          <Button onClick={() => setCreateOpen(true)}>
            <Plus />
            New order
          </Button>
        )}
      </div>

      {!canRead ? (
        <NoAccess resource="orders" />
      ) : isError && errorCode(error) === 'FORBIDDEN' ? (
        <NoAccess resource="orders" variant="rejected" permission="orders.read" />
      ) : isError ? (
        <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {errorMessage(error)}
        </p>
      ) : (
        <>
          <div className="flex flex-wrap items-end gap-3 rounded-md border p-3">
            <div className="grid gap-1.5">
              <Label htmlFor="filter-supplier" className="text-xs">
                Supplier
              </Label>
              <Select
                value={supplierId || ALL}
                onValueChange={(v) => setSupplierId(v === ALL ? '' : v)}
              >
                <SelectTrigger id="filter-supplier" className="h-8 w-56">
                  <SelectValue placeholder="All suppliers" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>All suppliers</SelectItem>
                  {suppliers.map((supplier) => (
                    <SelectItem key={supplier.id} value={supplier.id}>
                      {supplier.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="filter-plan" className="text-xs">
                Order plan
              </Label>
              <Select value={planId || ALL} onValueChange={(v) => setPlanId(v === ALL ? '' : v)}>
                <SelectTrigger id="filter-plan" className="h-8 w-56">
                  <SelectValue placeholder="All plans" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>All plans</SelectItem>
                  {plans.map((plan) => (
                    <SelectItem key={plan.id} value={plan.id}>
                      {plan.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {isFiltered && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setSupplierId('')
                  setPlanId('')
                }}
              >
                <X className="size-3.5" />
                Clear
              </Button>
            )}
          </div>

          <DataTable
            columns={columns}
            data={orders}
            rowKey={(order) => order.id}
            isLoading={isLoading}
            emptyMessage={
              isFiltered
                ? 'No orders match this filter.'
                : 'No orders yet. Create the first one to start ordering from suppliers.'
            }
            getSearchText={(order) =>
              `${order.orderCode} ${order.item?.name ?? ''} ${order.supplier?.name ?? ''}`
            }
            searchPlaceholder="Search orders…"
            pageSize={15}
            renderExpanded={(order) => {
              // Only orders with deliveries expand; the rest keep a plain row.
              const cargos = order.cargos ?? []
              if (cargos.length === 0) return null

              const unit = order.item?.baseUnit?.code ?? ''
              const delivered = Number(order.stockCargos)
              const ordered = Number(order.quantity)
              const remaining = Number(order.remainingStock)

              return (
                <div className="px-4 py-3">
                  <p className="mb-2 text-xs font-medium text-muted-foreground">
                    {cargos.length} cargo {cargos.length === 1 ? 'delivery' : 'deliveries'}
                  </p>

                  <ul className="grid gap-1">
                    {cargos.map((cargo, index) => {
                      // The nested cargo carries no id or vessel name — only
                      // its stocks — so deliveries are numbered, not named.
                      const total = (cargo.stocks ?? []).reduce(
                        (sum, stock) => sum + Number(stock.quantity ?? 0),
                        0,
                      )
                      return (
                        <li
                          key={index}
                          className="flex items-baseline justify-between gap-3 border-b border-border/50 pb-1 text-sm last:border-0"
                        >
                          <span className="text-muted-foreground">Cargo {index + 1}</span>
                          <span className="tabular-nums">
                            {total.toLocaleString()}
                            {unit && (
                              <span className="ml-1 text-xs text-muted-foreground">{unit}</span>
                            )}
                          </span>
                        </li>
                      )
                    })}
                  </ul>

                  <div className="mt-2 flex items-baseline justify-between gap-3 text-sm font-medium">
                    <span>Total delivered</span>
                    <span className="tabular-nums">
                      {delivered.toLocaleString()}
                      {unit && <span className="ml-1 text-xs font-normal">{unit}</span>}
                      {Number.isFinite(ordered) && (
                        <span className="ml-1 text-xs font-normal text-muted-foreground">
                          of {ordered.toLocaleString()} ordered
                        </span>
                      )}
                    </span>
                  </div>

                  {/* The outstanding balance, from the server. Negative means
                      more arrived than was ordered. */}
                  {Number.isFinite(remaining) && remaining !== 0 && (
                    <div
                      className={cn(
                        'mt-1 flex items-baseline justify-between gap-3 border-t pt-1 text-sm',
                        remaining < 0 && 'text-amber-600 dark:text-amber-500',
                      )}
                    >
                      <span>{remaining > 0 ? 'Still to deliver' : 'Over-delivered by'}</span>
                      <span className="font-medium tabular-nums">
                        {Math.abs(remaining).toLocaleString()}
                        {unit && <span className="ml-1 text-xs font-normal">{unit}</span>}
                      </span>
                    </div>
                  )}
                </div>
              )
            }}
          />
        </>
      )}

      <OrderFormDialog open={createOpen} onOpenChange={setCreateOpen} />

      {/* Keyed by id so the form re-fetches when a different order is opened. */}
      <OrderFormDialog
        key={editId ?? 'edit'}
        open={Boolean(editId)}
        onOpenChange={(open) => !open && setEditId(null)}
        orderId={editId}
      />
    </div>
  )
}
