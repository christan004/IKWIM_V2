import { useState } from 'react'
import { Gauge, Pencil, Plus } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { DataTable, type DataTableColumn } from '@/components/data-table'
import { NoAccess } from '@/components/no-access'
import { PERMISSION_MODULES, usePermissions } from '@/hooks/use-permissions'
import { ItemFormDialog } from '@/features/items/components/item-form-dialog'
import { ToleranceRateDialog } from '@/features/items/components/tolerance-rate-dialog'
import { useItems, type ItemRow } from '@/features/items/use-items'
import { useToleranceRates } from '@/features/items/use-tolerance-rates'
import { useUnits } from '@/features/units/use-units'
import { errorCode, errorMessage } from '@/lib/error-message'

export function ItemsPage() {
  const permissions = usePermissions()
  const { canRead, canCreate, canEdit } = permissions.forModule(PERMISSION_MODULES.items)
  const canReadUnits = permissions.forModule(PERMISSION_MODULES.units).canRead
  // Skip the request entirely when the user may not read the resource.
  const { rows, isLoading, isError, error } = useItems({ enabled: canRead })
  // Units label the rows and fill the form's dropdowns, but the query is shared
  // with the Units page — so it is gated on `units.read`, not `items.read`.
  const { units } = useUnits({ enabled: canReadUnits })
  /*
   * Tolerance rates have no module or permissions of their own — `items.*`
   * governs them — so they are gated on the same read this page already needs,
   * and fetched once for the whole table rather than per row.
   */
  const { rates } = useToleranceRates({ enabled: canRead })
  const [createOpen, setCreateOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<ItemRow | null>(null)
  const [rateTarget, setRateTarget] = useState<ItemRow | null>(null)

  const unitCode = (id: string) => units.find((u) => u.id === id)?.code
  /** An item has at most one rate; `undefined` means none is set yet. */
  const rateFor = (itemId: string) => rates.find((r) => r.itemId === itemId)

  const columns: DataTableColumn<ItemRow>[] = [
    {
      header: 'Name',
      cell: (row) => (
        // Indented to keep the hierarchy readable once flattened into rows.
        <div style={{ paddingLeft: `${row.depth * 1.25}rem` }}>
          <span className="flex items-center font-medium">
            {row.depth > 0 && <span className="mr-2 text-muted-foreground">└</span>}
            {row.name}
          </span>
          {row.descriptions && (
            <span className="block text-xs text-muted-foreground">{row.descriptions}</span>
          )}
        </div>
      ),
    },
    {
      header: 'Base unit',
      cell: (row) => {
        const code = unitCode(row.baseUnitId)
        return code ? (
          <Badge variant="secondary" className="font-mono">
            {code}
          </Badge>
        ) : (
          <span className="text-muted-foreground">—</span>
        )
      },
    },
    {
      header: 'Parent',
      cell: (row) => row.parentName ?? <span className="text-muted-foreground">—</span>,
    },
    {
      header: 'Variants',
      cell: (row) =>
        row.childCount > 0 ? row.childCount : <span className="text-muted-foreground">—</span>,
    },
    {
      header: 'Tolerance',
      // The allowance within which a discrepancy on this item is not counted as
      // a loss. Not every item has one set.
      cell: (row) => {
        const rate = rateFor(row.id)
        if (!rate) return <span className="text-muted-foreground">—</span>
        return <span className="font-medium tabular-nums">{Number(rate.maxRate).toLocaleString()}</span>
      },
    },
    ...(canEdit
      ? [
          {
            header: '',
            className: 'text-right',
            // There is no delete endpoint for either an item or its tolerance
            // rate, so editing is the only correction path for both.
            cell: (row: ItemRow) => (
              <div className="flex justify-end gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setRateTarget(row)}
                  title={
                    rateFor(row.id) ? 'Edit tolerance rate' : 'Set tolerance rate'
                  }
                >
                  <Gauge className="size-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setEditTarget(row)}
                  title="Edit item"
                >
                  <Pencil className="size-3.5" />
                </Button>
              </div>
            ),
          },
        ]
      : []),
  ]

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight">Items</h1>
          <p className="text-sm text-muted-foreground">
            Products and materials, each measured in a base unit. Nest one under another to
            group variants.
          </p>
        </div>
        {canCreate && (
          <Button onClick={() => setCreateOpen(true)}>
            <Plus />
            New item
          </Button>
        )}
      </div>

      {!canRead ? (
        <NoAccess resource="items" />
      ) : isError && errorCode(error) === 'FORBIDDEN' ? (
        // The role grants items.read, but the API refused anyway — a
        // server-side gating mismatch, not a missing grant.
        <NoAccess resource="items" variant="rejected" permission="items.read" />
      ) : isError ? (
        <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {errorMessage(error)}
        </p>
      ) : (
        <DataTable
          columns={columns}
          data={rows}
          rowKey={(row) => row.id}
          isLoading={isLoading}
          emptyMessage="No items yet. Create the first one to start tracking stock."
          getSearchText={(row) => `${row.name} ${row.descriptions ?? ''}`}
          searchPlaceholder="Search items…"
          pageSize={15}
        />
      )}

      <ItemFormDialog open={createOpen} onOpenChange={setCreateOpen} allRows={rows} />

      {/* Keyed by id so the form re-seeds when a different item is opened. */}
      <ItemFormDialog
        key={editTarget?.id ?? 'edit'}
        open={Boolean(editTarget)}
        onOpenChange={(open) => !open && setEditTarget(null)}
        item={editTarget}
        allRows={rows}
      />

      {/* Likewise keyed, so switching rows re-seeds the rate. */}
      {rateTarget && (
        <ToleranceRateDialog
          key={rateTarget.id}
          open={Boolean(rateTarget)}
          onOpenChange={(open) => !open && setRateTarget(null)}
          itemId={rateTarget.id}
          itemName={rateTarget.name}
          rate={rateFor(rateTarget.id)}
        />
      )}
    </div>
  )
}
