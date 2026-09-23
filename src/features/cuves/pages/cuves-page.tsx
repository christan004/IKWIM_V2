import { useState } from 'react'
import { Pencil, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { DataTable, type DataTableColumn } from '@/components/data-table'
import { NoAccess } from '@/components/no-access'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { PERMISSION_MODULES, usePermissions } from '@/hooks/use-permissions'
import { CuveFormDialog } from '@/features/cuves/components/cuve-form-dialog'
import { useCuves, useToggleCuveStatus } from '@/features/cuves/use-cuves'
import { useUnits } from '@/features/units/use-units'
import { errorCode, errorMessage } from '@/lib/error-message'
import type { Cuve } from '@/api/types'

/** Levels arrive as strings, so they are parsed before formatting. */
function formatLevel(value: string | undefined): string {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed.toLocaleString() : (value ?? '—')
}

export function CuvesPage() {
  const permissions = usePermissions()
  const { canRead, canCreate, canEdit } = permissions.forModule(PERMISSION_MODULES.cuve)
  // Each shared query is gated on its own module's permission.
  const canReadItems = permissions.forModule(PERMISSION_MODULES.items).canRead
  const canReadUnits = permissions.forModule(PERMISSION_MODULES.units).canRead
  const canReadSites = permissions.forModule(PERMISSION_MODULES.pss).canRead

  const { cuves, isLoading, isError, error } = useCuves({ enabled: canRead })
  // The nested item carries a bare `baseUnitId`, so the unit needs its own list.
  const { units } = useUnits({ enabled: canRead && canReadUnits })
  const toggleStatus = useToggleCuveStatus()

  const [createOpen, setCreateOpen] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [pending, setPending] = useState<Cuve | null>(null)
  /** Which row is mid-request, so its switch is disabled while saving. */
  const [savingId, setSavingId] = useState<string | null>(null)

  /** The unit a cuve's levels are expressed in, via its item. */
  const unitOf = (cuve: Cuve) =>
    units.find((u) => u.id === cuve.item?.baseUnitId)?.code ?? ''

  function applyToggle(cuve: Cuve) {
    setSavingId(cuve.id)
    toggleStatus.mutate(cuve.id, {
      onSuccess: () => {
        toast.success(
          cuve.status === 'active' ? `${cuve.name} deactivated` : `${cuve.name} activated`,
        )
        setPending(null)
      },
      onError: (err) => toast.error(errorMessage(err)),
      onSettled: () => setSavingId(null),
    })
  }

  function requestToggle(cuve: Cuve) {
    // Deactivating takes a tank out of use, so it is confirmed; reactivating is
    // harmless and applies straight away.
    if (cuve.status === 'active') {
      setPending(cuve)
      return
    }
    applyToggle(cuve)
  }

  const columns: DataTableColumn<Cuve>[] = [
    {
      header: 'Cuve',
      cell: (row) => (
        <div>
          <span className="font-medium">{row.name}</span>
          {row.site?.name && (
            <span className="block text-xs text-muted-foreground">{row.site.name}</span>
          )}
        </div>
      ),
    },
    {
      header: 'Item',
      // The list nests the item, so only the unit needs resolving.
      cell: (row) => {
        if (!row.item) return <span className="text-muted-foreground">—</span>
        const code = unitOf(row)
        return (
          <div>
            <span className="text-sm">{row.item.name}</span>
            {code && <span className="block text-xs text-muted-foreground">in {code}</span>}
          </div>
        )
      },
    },
    {
      header: 'Levels',
      // Min and max define the working range, so they read as one value rather
      // than two columns that have to be mentally paired.
      cell: (row) => {
        const code = unitOf(row)
        return (
          <div className="tabular-nums">
            <span className="text-sm">
              {formatLevel(row.minimum)} – {formatLevel(row.maximum)}
              {code ? ` ${code}` : ''}
            </span>
            {Number(row.deadStock) > 0 && (
              <span className="block text-xs text-muted-foreground">
                {formatLevel(row.deadStock)} dead
              </span>
            )}
          </div>
        )
      },
    },
    {
      header: 'Status',
      // The endpoint only *toggles* — it takes no target state — so this is a
      // switch rather than a status dropdown.
      cell: (row) =>
        canEdit ? (
          <div className="flex items-center gap-2">
            <Switch
              checked={row.status === 'active'}
              disabled={savingId === row.id}
              onCheckedChange={() => requestToggle(row)}
              aria-label={`Toggle ${row.name}`}
            />
            <span className="text-xs text-muted-foreground">{row.status}</span>
          </div>
        ) : (
          <Badge variant={row.status === 'active' ? 'default' : 'outline'}>{row.status}</Badge>
        ),
    },
    ...(canEdit
      ? [
          {
            header: '',
            className: 'text-right',
            // There is no delete endpoint, so editing is the only correction path.
            cell: (row: Cuve) => (
              <Button variant="ghost" size="sm" onClick={() => setEditId(row.id)} title="Edit cuve">
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
          <h1 className="font-display text-2xl font-bold tracking-tight">Cuves</h1>
          <p className="text-sm text-muted-foreground">Storage tanks at your sites.</p>
        </div>
        {canCreate && (
          <Button onClick={() => setCreateOpen(true)}>
            <Plus />
            New cuve
          </Button>
        )}
      </div>

      {!canRead ? (
        <NoAccess resource="cuves" />
      ) : isError && errorCode(error) === 'FORBIDDEN' ? (
        <NoAccess resource="cuves" variant="rejected" permission="cuve.read" />
      ) : isError ? (
        <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {errorMessage(error)}
        </p>
      ) : (
        <DataTable
          columns={columns}
          data={cuves}
          rowKey={(row) => row.id}
          isLoading={isLoading}
          emptyMessage="No cuves yet. Add a tank to a site to get started."
          getSearchText={(row) =>
            `${row.name} ${row.site?.name ?? ''} ${row.item?.name ?? ''} ${unitOf(row)} ${row.status}`
          }
          searchPlaceholder="Search cuves…"
          pageSize={15}
        />
      )}

      <CuveFormDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        canReadItems={canReadItems}
        canReadUnits={canReadUnits}
        canReadSites={canReadSites}
      />

      {/* Keyed by id so the form re-fetches when a different record is opened. */}
      <CuveFormDialog
        key={editId ?? 'edit'}
        open={Boolean(editId)}
        onOpenChange={(open) => !open && setEditId(null)}
        cuveId={editId}
        canReadItems={canReadItems}
        canReadUnits={canReadUnits}
        canReadSites={canReadSites}
      />

      <ConfirmDialog
        open={Boolean(pending)}
        onOpenChange={(open) => !open && setPending(null)}
        title={pending ? `Deactivate ${pending.name}?` : ''}
        description="The cuve stays on the list and can be reactivated at any time."
        confirmLabel="Deactivate"
        variant="destructive"
        onConfirm={() => pending && applyToggle(pending)}
        isLoading={toggleStatus.isPending}
      />
    </div>
  )
}
