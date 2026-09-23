import { useMemo, useState } from 'react'
import { ChevronRight, Truck, X } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
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
import { ConfirmDialog } from '@/components/confirm-dialog'
import { PERMISSION_MODULES, usePermissions } from '@/hooks/use-permissions'
import { useSetStockStatus, useStockList } from '@/features/stock/use-stock'
import { useDeports } from '@/features/deports/use-deports'
import { NominationFormDialog } from '@/features/nominations/components/nomination-form-dialog'
import { errorCode, errorMessage } from '@/lib/error-message'
import { STOCK_STATUSES, type Stock, type StockGroup, type StockStatus } from '@/api/types'

const STATUS_LABEL: Record<StockStatus, string> = {
  awaiting: 'Awaiting',
  received: 'Received',
  returned: 'Returned',
  cancelled: 'Cancelled',
}

const STATUS_VARIANT: Record<StockStatus, 'default' | 'secondary' | 'outline'> = {
  awaiting: 'secondary',
  received: 'default',
  returned: 'outline',
  cancelled: 'outline',
}

/** Returning or cancelling stock is a decision, so it is confirmed. */
const NEEDS_CONFIRMATION: StockStatus[] = ['returned', 'cancelled']

/**
 * Sentinel for "no filter". Radix Select cannot hold an empty string as a
 * value, so the unfiltered option needs one of its own.
 */
const ALL = '__all__'

/**
 * Statuses that still represent stock in hand. `totalQuantity` counts every
 * status, so what is actually held comes from `quantitiesByStatus` instead.
 */
const HELD: StockStatus[] = ['awaiting', 'received']

/** Formats the UTC calendar day the API stores, without shifting it locally. */
function formatDate(iso: string | undefined): string {
  if (!iso) return '—'
  const [year, month, day] = iso.slice(0, 10).split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString(undefined, {
    timeZone: 'UTC',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

/** Quantities cross the string/number boundary, so both are parsed. */
function formatQty(value: string | number | undefined): string {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed.toLocaleString() : '—'
}

/**
 * Stock is **view-only**: records are produced by the cargo flow, so this page
 * lists them and moves them between statuses. There is no create or edit.
 *
 * The API groups by item, so each row is an item and its individual receipts
 * expand beneath it.
 */
export function StockPage() {
  const permissions = usePermissions()
  const { canRead, canEdit } = permissions.forModule(PERMISSION_MODULES.stock)
  // The depot list is shared with its own page, so it is gated on that
  // module's permission rather than the stock one.
  const canReadDeports = permissions.forModule(PERMISSION_MODULES.deports).canRead
  // Nominations are raised from here, so the button is gated on that module's
  // create permission rather than anything on stock.
  const canCreateNomination = permissions.forModule(PERMISSION_MODULES.nominations).canCreate
  const canReadDrivers = permissions.forModule(PERMISSION_MODULES.drivers).canRead
  const canReadItems = permissions.forModule(PERMISSION_MODULES.items).canRead

  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [statusFilter, setStatusFilter] = useState<StockStatus | ''>('')
  const [deportId, setDeportId] = useState('')

  /**
   * Only set filters are sent: the API validates each one when present, so
   * `status=` returns `400` rather than meaning "no filter".
   *
   * Dates are widened to cover the whole day — an `<input type="date">` gives a
   * calendar day, and sending midnight as the end would exclude everything
   * received later that day.
   */
  const filter = useMemo(
    () => ({
      ...(startDate ? { startDate: `${startDate}T00:00:00.000Z` } : {}),
      ...(endDate ? { endDate: `${endDate}T23:59:59.999Z` } : {}),
      ...(statusFilter ? { status: statusFilter } : {}),
      ...(deportId ? { deportId } : {}),
    }),
    [startDate, endDate, statusFilter, deportId],
  )

  const isFiltered = Object.keys(filter).length > 0

  const { groups, isLoading, isError, error } = useStockList({ enabled: canRead, filter })
  const { deports } = useDeports({ enabled: canRead && canReadDeports })
  const setStatus = useSetStockStatus()

  const [pending, setPending] = useState<{ row: Stock; status: StockStatus } | null>(null)
  /** Which row is mid-request, so its dropdown is disabled while saving. */
  const [savingId, setSavingId] = useState<string | null>(null)
  /** The stock a new nomination is being raised against, if any. */
  const [nominateStockId, setNominateStockId] = useState<string | null>(null)

  /**
   * What is actually held. `totalQuantity` counts cancelled and returned stock
   * too, so the held figure is summed from the statuses that still represent
   * stock on hand.
   */
  const heldQuantity = (group: StockGroup) =>
    HELD.reduce((sum, status) => sum + (group.summary?.quantitiesByStatus?.[status] ?? 0), 0)

  function applyStatus(row: Stock, status: StockStatus) {
    setSavingId(row.id)
    setStatus.mutate(
      { id: row.id, status },
      {
        onSuccess: () => {
          toast.success(`Stock set to ${STATUS_LABEL[status].toLowerCase()}`)
          setPending(null)
        },
        onError: (err) => toast.error(errorMessage(err)),
        onSettled: () => setSavingId(null),
      },
    )
  }

  function requestStatusChange(row: Stock, status: StockStatus) {
    if (status === row.status) return
    if (NEEDS_CONFIRMATION.includes(status)) {
      setPending({ row, status })
      return
    }
    applyStatus(row, status)
  }

  const columns: DataTableColumn<StockGroup>[] = [
    {
      header: 'Item',
      // The item now carries a fully resolved `baseUnit`, so the unit needs no
      // second request — unlike the earlier shape's bare `baseUnitId`.
      cell: (group) => (
        <div className="flex items-center gap-2">
          <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" />
          <div>
            <span className="font-medium">{group.item?.name ?? '—'}</span>
            {group.item?.baseUnit && (
              <span className="block text-xs text-muted-foreground">
                in {group.item.baseUnit.name} ({group.item.baseUnit.code})
              </span>
            )}
          </div>
        </div>
      ),
    },
    {
      header: 'On hand',
      cell: (group) => {
        const held = heldQuantity(group)
        const code = group.item?.baseUnit?.code
        return (
          <span className="font-medium tabular-nums">
            {held.toLocaleString()}
            {code && <span className="ml-1 text-xs font-normal text-muted-foreground">{code}</span>}
          </span>
        )
      },
    },
    {
      header: 'By status',
      // The API's own per-status split, so the make-up of a total is visible
      // without expanding the row.
      cell: (group) => {
        const byStatus = group.summary?.quantitiesByStatus ?? {}
        const present = STOCK_STATUSES.filter((s) => byStatus[s] !== undefined)
        if (present.length === 0) return <span className="text-muted-foreground">—</span>

        return (
          <div className="flex flex-wrap gap-1">
            {present.map((status) => (
              <Badge key={status} variant={STATUS_VARIANT[status]} className="font-normal">
                {STATUS_LABEL[status]} {Number(byStatus[status]).toLocaleString()}
              </Badge>
            ))}
          </div>
        )
      },
    },
    {
      header: 'Total received',
      // The API's gross figure, kept beside the held one so the difference is
      // visible rather than the page silently disagreeing with the backend.
      cell: (group) => {
        const total = Number(group.summary?.totalQuantity)
        const held = heldQuantity(group)
        const excluded = total - held

        return (
          <div className="tabular-nums">
            <span className="text-sm">{formatQty(total)}</span>
            {excluded > 0 && (
              <span className="block text-xs text-muted-foreground">
                {excluded.toLocaleString()} cancelled or returned
              </span>
            )}
          </div>
        )
      },
    },
    {
      header: 'Lines',
      cell: (group) => (
        <span className="text-sm text-muted-foreground">
          {group.summary?.stockCount ?? (group.stocks ?? []).length}
        </span>
      ),
    },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight">Stock</h1>
        <p className="text-sm text-muted-foreground">
          Stock held at your depots, grouped by item. Click an item to see each receipt.
        </p>
      </div>

      {!canRead ? (
        <NoAccess resource="stock" />
      ) : isError && errorCode(error) === 'FORBIDDEN' ? (
        <NoAccess resource="stock" variant="rejected" permission="stock.read" />
      ) : isError ? (
        <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {errorMessage(error)}
        </p>
      ) : (
        <>
          <div className="flex flex-wrap items-end gap-3 rounded-md border p-3">
            <div className="grid gap-1.5">
              <Label htmlFor="filter-start" className="text-xs">
                Received from
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
                Received to
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

            <div className="grid gap-1.5">
              <Label htmlFor="filter-status" className="text-xs">
                Status
              </Label>
              <Select
                value={statusFilter || ALL}
                onValueChange={(v) => setStatusFilter(v === ALL ? '' : (v as StockStatus))}
              >
                <SelectTrigger id="filter-status" className="h-8 w-40">
                  <SelectValue placeholder="All statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>All statuses</SelectItem>
                  {STOCK_STATUSES.map((status) => (
                    <SelectItem key={status} value={status}>
                      {STATUS_LABEL[status]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Hidden rather than shown empty when the depot list cannot be
                read — an empty picker would look broken. */}
            {canReadDeports && (
              <div className="grid gap-1.5">
                <Label htmlFor="filter-deport" className="text-xs">
                  Depot
                </Label>
                <Select
                  value={deportId || ALL}
                  onValueChange={(v) => setDeportId(v === ALL ? '' : v)}
                >
                  <SelectTrigger id="filter-deport" className="h-8 w-56">
                    <SelectValue placeholder="All depots" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL}>All depots</SelectItem>
                    {deports.map((deport) => (
                      <SelectItem key={deport.id} value={deport.id}>
                        {deport.name}
                        {deport.location ? ` — ${deport.location}` : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {isFiltered && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setStartDate('')
                  setEndDate('')
                  setStatusFilter('')
                  setDeportId('')
                }}
              >
                <X className="size-3.5" />
                Clear
              </Button>
            )}
          </div>

          <DataTable
            columns={columns}
            data={groups}
            rowKey={(group) => group.item?.id ?? ''}
            isLoading={isLoading}
            emptyMessage={
              isFiltered
                ? 'No stock matches these filters.'
                : 'No stock yet. Stock appears here once it is recorded against a cargo shipment.'
            }
          getSearchText={(group) => {
            const vessels = (group.stocks ?? []).map((s) => s.cargo?.vesselName ?? '').join(' ')
            const refs = (group.stocks ?? []).map((s) => s.cargo?.blRef ?? '').join(' ')
            const depots = (group.stocks ?? []).map((s) => s.depot?.name ?? '').join(' ')
            return `${group.item?.name ?? ''} ${group.item?.baseUnit?.code ?? ''} ${vessels} ${refs} ${depots}`
          }}
          searchPlaceholder="Search stock…"
          pageSize={15}
          renderExpanded={(group) => {
            const rows = group.stocks ?? []
            if (rows.length === 0) return null
            const code = group.item?.baseUnit?.code

            return (
              <div className="px-4 py-3">
                <p className="mb-2 text-xs font-medium text-muted-foreground">
                  {rows.length} stock {rows.length === 1 ? 'receipt' : 'receipts'}
                </p>

                <div className="grid gap-2">
                  {rows.map((row) => (
                    <div
                      key={row.id}
                      className="border-b border-border/50 pb-2 last:border-0 last:pb-0"
                    >
                    <div className="flex flex-wrap items-center gap-3">
                      <div className="min-w-40 flex-1">
                        <span className="text-sm font-medium">
                          {row.cargo?.vesselName ?? 'Stock'}
                        </span>
                        <span className="block text-xs text-muted-foreground">
                          {row.depot?.name ?? '—'}
                          {row.depot?.location ? ` · ${row.depot.location}` : ''}
                          {row.cargo?.blRef ? ` · BL ${row.cargo.blRef}` : ''}
                        </span>
                      </div>

                      <div className="tabular-nums">
                        <span className="text-sm">
                          {formatQty(row.remainingQuantity)}
                          {code && (
                            <span className="ml-1 text-xs text-muted-foreground">{code}</span>
                          )}
                        </span>
                        {/* What has been nominated away, when any has — the
                            receipt total alone would overstate availability. */}
                        {Number(row.nominatedQuantity) > 0 && (
                          <span className="block text-xs text-muted-foreground">
                            of {formatQty(row.quantityBeforeNominations)} received
                          </span>
                        )}
                      </div>

                      <span className="min-w-24 text-xs text-muted-foreground">
                        {formatDate(row.receivedDate)}
                      </span>

                      {canEdit ? (
                        <Select
                          value={row.status}
                          disabled={savingId === row.id}
                          onValueChange={(value) => requestStatusChange(row, value as StockStatus)}
                        >
                          <SelectTrigger
                            className="h-8 w-36"
                            // The row toggles the panel, so the click must stop
                            // here or changing a status would collapse it.
                            onClick={(event) => event.stopPropagation()}
                          >
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {STOCK_STATUSES.map((status) => (
                              <SelectItem key={status} value={status}>
                                {STATUS_LABEL[status]}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <Badge variant={STATUS_VARIANT[row.status]}>
                          {STATUS_LABEL[row.status]}
                        </Badge>
                      )}

                      {/* Nominations are raised from here, against a specific
                          receipt — the Nominations page only edits them. Only
                          received stock with something left can be nominated. */}
                      {canCreateNomination &&
                        row.status === 'received' &&
                        row.remainingQuantity > 0 && (
                          <Button
                            variant="outline"
                            size="sm"
                            // The row toggles the panel, so the click must stop
                            // here or opening the form would collapse it.
                            onClick={(event) => {
                              event.stopPropagation()
                              setNominateStockId(row.id)
                            }}
                          >
                            <Truck className="size-3.5" />
                            Nominate
                          </Button>
                        )}
                    </div>

                    {/*
                      * Where this receipt's stock went. The figures reconcile —
                      * these quantities sum to `nominatedQuantity`, and
                      * `quantityBeforeNominations - nominatedQuantity` is what
                      * is left — so the list explains the remaining figure
                      * above rather than merely repeating it.
                      */}
                    {(row.nominations ?? []).length > 0 && (
                      <div className="mt-1.5 grid gap-1 pl-3">
                        {(row.nominations ?? []).map((nomination) => (
                          <div
                            key={nomination.id}
                            className="flex flex-wrap items-baseline gap-2 text-xs text-muted-foreground"
                          >
                            <span className="tabular-nums font-medium text-foreground">
                              {formatQty(nomination.quantity)}
                              {code ? ` ${code}` : ''}
                            </span>
                            <span>→ {nomination.destination}</span>
                            {/* Flat here, unlike /nominations which nests the
                                pair as `driverVehicle`. */}
                            {nomination.driver?.names && <span>{nomination.driver.names}</span>}
                            {nomination.vehicle?.platNumber && (
                              <span className="font-mono">{nomination.vehicle.platNumber}</span>
                            )}
                            {nomination.expectedLoadingDate && (
                              <span>loads {formatDate(nomination.expectedLoadingDate)}</span>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                    </div>
                  ))}
                </div>
              </div>
            )
          }}
          />
        </>
      )}

      {/* Keyed by stock so the form resets when a different receipt is
          nominated rather than resuming the previous one. */}
      <NominationFormDialog
        key={nominateStockId ?? 'nominate'}
        open={Boolean(nominateStockId)}
        onOpenChange={(next) => !next && setNominateStockId(null)}
        stockId={nominateStockId}
        canReadStock={canRead}
        canReadDrivers={canReadDrivers}
        canReadItems={canReadItems}
      />

      <ConfirmDialog
        open={Boolean(pending)}
        onOpenChange={(open) => !open && setPending(null)}
        title={pending ? `Mark stock as ${STATUS_LABEL[pending.status].toLowerCase()}?` : ''}
        description="You can change the status again afterwards."
        confirmLabel={pending ? STATUS_LABEL[pending.status] : 'Confirm'}
        variant={pending?.status === 'cancelled' ? 'destructive' : 'default'}
        onConfirm={() => pending && applyStatus(pending.row, pending.status)}
        isLoading={setStatus.isPending}
      />
    </div>
  )
}
