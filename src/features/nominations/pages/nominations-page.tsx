import { useMemo, useState } from 'react'
import { ChevronRight, Pencil, ReceiptText, X } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { DataTable, type DataTableColumn } from '@/components/data-table'
import { NoAccess } from '@/components/no-access'
import { PERMISSION_MODULES, usePermissions } from '@/hooks/use-permissions'
import { NominationFormDialog } from '@/features/nominations/components/nomination-form-dialog'
import { NominationTimeline } from '@/features/nominations/components/nomination-timeline'
import { PfiFormDialog } from '@/features/pfi/components/pfi-form-dialog'
import { useNominations } from '@/features/nominations/use-nominations'
import { useUnits } from '@/features/units/use-units'
import { useItems } from '@/features/items/use-items'
import { errorCode, errorMessage } from '@/lib/error-message'
import { nominationQuantity } from '@/api/types'
import type { Nomination } from '@/api/types'

/**
 * Sentinel for "no filter". Radix Select cannot hold an empty string as a
 * value, so the unfiltered option needs one of its own.
 */
const ALL = '__all__'

/** Quantities arrive as strings, so they are parsed before formatting. */
function formatQty(value: string | number | undefined): string {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed.toLocaleString() : (String(value ?? '') || '—')
}

export function NominationsPage() {
  const permissions = usePermissions()
  const { canRead, canEdit } = permissions.forModule(PERMISSION_MODULES.nominations)
  // Both queries are shared with their own pages, so each is gated on its own
  // module's permission rather than the nominations one.
  const canReadStock = permissions.forModule(PERMISSION_MODULES.stock).canRead
  const canReadDrivers = permissions.forModule(PERMISSION_MODULES.drivers).canRead
  const canReadItems = permissions.forModule(PERMISSION_MODULES.items).canRead
  // The nested item carries a bare `baseUnitId`, so the unit needs its own list.
  const canReadUnits = permissions.forModule(PERMISSION_MODULES.units).canRead
  // PFIs are raised from here, so the action is gated on that module's create
  // permission rather than anything on nominations.
  const canCreatePfi = permissions.forModule(PERMISSION_MODULES.pfi).canCreate

  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [itemId, setItemId] = useState('')

  /**
   * Only set filters are sent: each is validated when present, so `itemId=`
   * returns `400` rather than meaning "no filter".
   *
   * Dates are widened to cover the whole day — an `<input type="date">` gives a
   * calendar day, and sending midnight as the end would exclude everything
   * later that day.
   */
  const filter = useMemo(
    () => ({
      ...(startDate ? { startDate: `${startDate}T00:00:00.000Z` } : {}),
      ...(endDate ? { endDate: `${endDate}T23:59:59.999Z` } : {}),
      ...(itemId ? { itemId } : {}),
    }),
    [startDate, endDate, itemId],
  )

  const isFiltered = Object.keys(filter).length > 0

  const { nominations, isLoading, isError, error } = useNominations({ enabled: canRead, filter })
  const { units } = useUnits({ enabled: canRead && canReadUnits })
  const { rows: itemRows } = useItems({ enabled: canRead && canReadItems })

  /**
   * Options for the item filter, taken from the **items list** rather than from
   * the nominations on screen: those are already filtered, so choosing an item
   * would shrink the options to that one item and leave no way back.
   *
   * Only leaves are offered — stock is held against a category, not a class.
   * The currently selected id is always kept, so the Select never loses its
   * mounted option.
   */
  const filterableItems = itemRows.filter((r) => r.childCount === 0 || r.id === itemId)

  const [editId, setEditId] = useState<string | null>(null)
  /** The nomination a new PFI is being raised against, if any. */
  const [pfiForId, setPfiForId] = useState<string | null>(null)

  const columns: DataTableColumn<Nomination>[] = [
    {
      header: 'Item',
      // The list now nests the stock, so what is being moved leads — the driver
      // and vehicle only say who is moving it.
      cell: (row) => {
        const item = row.stock?.item
        const parentName = item ? itemRows.find((r) => r.id === item.id)?.parentName : undefined
        return (
          // The chevron is the only cue that the row opens — without it the
          // timeline is there but undiscoverable.
          <div className="flex items-center gap-2">
            <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" />
            {item ? (
              <div>
                <span className="font-medium">{item.name}</span>
                {parentName && (
                  <span className="block text-xs text-muted-foreground">{parentName}</span>
                )}
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
        // The nested item carries a bare `baseUnitId`, unlike the stock
        // endpoint's resolved `baseUnit`, so the unit is looked up.
        const code = units.find((u) => u.id === row.stock?.item?.baseUnitId)?.code
        const corrected = nominationQuantity(row)
        const ambient = Number(row.ambQuantity)
        // Two figures now. The corrected one leads — it is what the stock
        // ceiling applies to — and ambient is shown only when it differs,
        // since an identical pair says nothing worth a second line.
        const differs =
          Number.isFinite(ambient) && Number.isFinite(corrected) && ambient !== corrected

        return (
          <div className="tabular-nums">
            <span className="font-medium">
              {formatQty(corrected)}
              {code && (
                <span className="ml-1 text-xs font-normal text-muted-foreground">{code}</span>
              )}
            </span>
            <span className="block text-xs font-normal text-muted-foreground">
              at 20&nbsp;°C
              {differs ? ` · ${formatQty(row.ambQuantity)} ambient` : ''}
            </span>
          </div>
        )
      },
    },
    {
      header: 'From',
      // The cargo the stock came from — vessel and BL are what identify a
      // shipment in conversation.
      cell: (row) => {
        const cargo = row.stock?.cargo
        if (!cargo) return <span className="text-muted-foreground">—</span>
        return (
          <div>
            <span className="text-sm">{cargo.vesselName}</span>
            {cargo.blRef && (
              <span className="block text-xs text-muted-foreground">BL {cargo.blRef}</span>
            )}
          </div>
        )
      },
    },
    {
      header: 'Destination',
      cell: (row) => <span className="text-sm">{row.destination}</span>,
    },
    {
      header: 'Driver',
      // The list nests `driverVehicle` but carries no ids, so this is the only
      // place the driver's name is available — see the `Nomination` type.
      cell: (row) => {
        const driver = row.driverVehicle?.driver
        if (!driver) return <span className="text-muted-foreground">—</span>
        return (
          <div>
            <span className="text-sm">{driver.names}</span>
            {driver.phone && (
              <span className="block text-xs text-muted-foreground">{driver.phone}</span>
            )}
          </div>
        )
      },
    },
    {
      header: 'Vehicle',
      cell: (row) => {
        const vehicle = row.driverVehicle?.vechile
        if (!vehicle) return <span className="text-muted-foreground">—</span>
        return (
          <div>
            <span className="text-sm font-medium">{vehicle.platNumber}</span>
            {vehicle.tankCapacity && (
              <span className="block text-xs text-muted-foreground">
                Capacity {Number(vehicle.tankCapacity).toLocaleString()}
              </span>
            )}
          </div>
        )
      },
    },
    ...(canEdit || canCreatePfi
      ? [
          {
            header: '',
            className: 'text-right',
            cell: (row: Nomination) => (
              // The row itself toggles the timeline, so the actions must not
              // also expand it on their way through.
              <div
                className="flex justify-end gap-1"
                onClick={(event) => event.stopPropagation()}
              >
                {/* PFIs are raised from here — the PFI page only lists and
                    edits them. */}
                {canCreatePfi && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPfiForId(row.id)}
                    title="Raise a PFI for this nomination"
                  >
                    <ReceiptText className="size-3.5" />
                    PFI
                  </Button>
                )}
                {/* There is no delete endpoint, so editing is the only
                    correction path. */}
                {canEdit && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setEditId(row.id)}
                    title="Edit nomination"
                  >
                    <Pencil className="size-3.5" />
                  </Button>
                )}
              </div>
            ),
          },
        ]
      : []),
  ]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight">Nominations</h1>
        <p className="text-sm text-muted-foreground">
          Stock allocated to a driver's vehicle for delivery. New nominations are raised
          from the Stock page, against the receipt they draw on.
        </p>
      </div>

      {!canRead ? (
        <NoAccess resource="nominations" />
      ) : isError && errorCode(error) === 'FORBIDDEN' ? (
        <NoAccess resource="nominations" variant="rejected" permission="nominations.read" />
      ) : isError ? (
        <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {errorMessage(error)}
        </p>
      ) : (
        <>
          <div className="flex flex-wrap items-end gap-3 rounded-md border p-3">
            <div className="grid gap-1.5">
              <Label htmlFor="filter-start" className="text-xs">
                Loading from
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
                Loading to
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

            {canReadItems && (
              <div className="grid gap-1.5">
                <Label htmlFor="filter-item" className="text-xs">
                  Item
                </Label>
                <Select
                  value={itemId || ALL}
                  onValueChange={(v) => setItemId(v === ALL ? '' : v)}
                >
                  <SelectTrigger id="filter-item" className="h-8 w-48">
                    <SelectValue placeholder="All items" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL}>All items</SelectItem>
                    {filterableItems.map((item) => (
                      <SelectItem key={item.id} value={item.id}>
                        {item.name}
                        {item.parentName ? ` — ${item.parentName}` : ''}
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
                  setItemId('')
                }}
              >
                <X className="size-3.5" />
                Clear
              </Button>
            )}
          </div>

          <DataTable
            columns={columns}
            data={nominations}
          rowKey={(row) => row.id}
          isLoading={isLoading}
          emptyMessage={
              isFiltered
                ? 'No nominations match these filters.'
                : 'No nominations yet. Raise one from the Stock page, against the receipt it draws on.'
            }
          getSearchText={(row) =>
            `${row.stock?.item?.name ?? ''} ${row.stock?.cargo?.vesselName ?? ''} ${
              row.stock?.cargo?.blRef ?? ''
            } ${row.driverVehicle?.driver.names ?? ''} ${
              row.driverVehicle?.vechile.platNumber ?? ''
            } ${row.destination}`
          }
            searchPlaceholder="Search nominations…"
            pageSize={15}
            /*
             * The list row carries no status of its own, so progress is only
             * visible here. The element is created per row but the table
             * renders it only once expanded, so no timeline is fetched until
             * someone actually opens one.
             */
            renderExpanded={(row) => (
              <div className="px-4 py-3">
                <NominationTimeline nominationId={row.id} />
              </div>
            )}
          />
        </>
      )}

      {/* Keyed by nomination so the form resets when a different one is
          invoiced rather than resuming the previous one. */}
      <PfiFormDialog
        key={pfiForId ?? 'pfi'}
        open={Boolean(pfiForId)}
        onOpenChange={(next) => !next && setPfiForId(null)}
        nominationId={pfiForId}
        canReadNominations={canRead}
      />

      {/* Edit only — creating happens on the Stock page, where the receipt
          being drawn on is already in view. */}
      <NominationFormDialog
        key={editId ?? 'edit'}
        open={Boolean(editId)}
        onOpenChange={(open) => !open && setEditId(null)}
        nominationId={editId}
        canReadStock={canReadStock}
        canReadDrivers={canReadDrivers}
        canReadItems={canReadItems}
      />
    </div>
  )
}
