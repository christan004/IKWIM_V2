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
import { NozzleFormDialog } from '@/features/nozzles/components/nozzle-form-dialog'
import { useNozzles, useToggleNozzleStatus } from '@/features/nozzles/use-nozzles'
import { useSites } from '@/features/pss/use-pss'
import { errorCode, errorMessage } from '@/lib/error-message'
import type { Nozzle } from '@/api/types'

export function NozzlesPage() {
  const permissions = usePermissions()
  const { canRead, canCreate, canEdit } = permissions.forModule(PERMISSION_MODULES.nozzle)
  // Each picker is gated on its own module's permission.
  const canReadPumps = permissions.forModule(PERMISSION_MODULES.pump).canRead
  const canReadDisplays = permissions.forModule(PERMISSION_MODULES.display).canRead
  const canReadCuves = permissions.forModule(PERMISSION_MODULES.cuve).canRead
  const canReadSites = permissions.forModule(PERMISSION_MODULES.pss).canRead

  const { nozzles, isLoading, isError, error } = useNozzles({ enabled: canRead })
  // The nested pump carries only a `siteId`, so naming the site needs the list.
  const { sites } = useSites({ enabled: canRead && canReadSites })
  const toggleStatus = useToggleNozzleStatus()

  const [createOpen, setCreateOpen] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [pending, setPending] = useState<Nozzle | null>(null)
  /** Which row is mid-request, so its switch is disabled while saving. */
  const [savingId, setSavingId] = useState<string | null>(null)

  /** The site a nozzle sits at, resolved through its pump. */
  const siteOf = (nozzle: Nozzle) => sites.find((s) => s.id === nozzle.pump?.siteId)

  function applyToggle(nozzle: Nozzle) {
    setSavingId(nozzle.id)
    toggleStatus.mutate(nozzle.id, {
      onSuccess: () => {
        toast.success(
          nozzle.status === 'active' ? `${nozzle.name} deactivated` : `${nozzle.name} activated`,
        )
        setPending(null)
      },
      onError: (err) => toast.error(errorMessage(err)),
      onSettled: () => setSavingId(null),
    })
  }

  function requestToggle(nozzle: Nozzle) {
    // Deactivating takes a nozzle out of use, so it is confirmed; reactivating
    // is harmless and applies straight away.
    if (nozzle.status === 'active') {
      setPending(nozzle)
      return
    }
    applyToggle(nozzle)
  }

  const columns: DataTableColumn<Nozzle>[] = [
    {
      header: 'Nozzle',
      cell: (row) => (
        <div>
          <span className="font-medium">{row.name}</span>
          <span className="block font-mono text-xs text-muted-foreground">{row.nozzleCode}</span>
        </div>
      ),
    },
    {
      header: 'Pump',
      // All three relations are nested, so only the site needs resolving.
      cell: (row) => {
        if (!row.pump) return <span className="text-muted-foreground">—</span>
        const site = siteOf(row)
        return (
          <div>
            <span className="text-sm">{row.pump.name}</span>
            {site && <span className="block text-xs text-muted-foreground">{site.name}</span>}
          </div>
        )
      },
    },
    {
      header: 'Cuve',
      // The cuve is what the nozzle draws from, so it carries the item.
      cell: (row) => {
        if (!row.cuve) return <span className="text-muted-foreground">—</span>
        return (
          <div>
            <span className="text-sm">{row.cuve.name}</span>
            {row.cuve.item?.name && (
              <span className="block text-xs text-muted-foreground">{row.cuve.item.name}</span>
            )}
          </div>
        )
      },
    },
    {
      header: 'Display',
      cell: (row) =>
        row.display ? (
          <div>
            <span className="text-sm">{row.display.name}</span>
            <span className="block font-mono text-xs text-muted-foreground">
              {row.display.code}
            </span>
          </div>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
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
            cell: (row: Nozzle) => (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setEditId(row.id)}
                title="Edit nozzle"
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
          <h1 className="font-display text-2xl font-bold tracking-tight">Nozzles</h1>
          <p className="text-sm text-muted-foreground">
            Nozzles tying a pump to a display and a cuve.
          </p>
        </div>
        {canCreate && (
          <Button onClick={() => setCreateOpen(true)}>
            <Plus />
            New nozzle
          </Button>
        )}
      </div>

      {!canRead ? (
        <NoAccess resource="nozzles" />
      ) : isError && errorCode(error) === 'FORBIDDEN' ? (
        <NoAccess resource="nozzles" variant="rejected" permission="nozzle.read" />
      ) : isError ? (
        <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {errorMessage(error)}
        </p>
      ) : (
        <DataTable
          columns={columns}
          data={nozzles}
          rowKey={(row) => row.id}
          isLoading={isLoading}
          emptyMessage="No nozzles yet. Add one to a pump to get started."
          getSearchText={(row) =>
            `${row.name} ${row.nozzleCode} ${row.pump?.name ?? ''} ${siteOf(row)?.name ?? ''} ${
              row.cuve?.name ?? ''
            } ${row.cuve?.item?.name ?? ''} ${row.display?.name ?? ''} ${row.status}`
          }
          searchPlaceholder="Search nozzles…"
          pageSize={15}
        />
      )}

      <NozzleFormDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        canReadPumps={canReadPumps}
        canReadDisplays={canReadDisplays}
        canReadCuves={canReadCuves}
      />

      {/* Keyed by id so the form re-fetches when a different record is opened. */}
      <NozzleFormDialog
        key={editId ?? 'edit'}
        open={Boolean(editId)}
        onOpenChange={(open) => !open && setEditId(null)}
        nozzleId={editId}
        canReadPumps={canReadPumps}
        canReadDisplays={canReadDisplays}
        canReadCuves={canReadCuves}
      />

      <ConfirmDialog
        open={Boolean(pending)}
        onOpenChange={(open) => !open && setPending(null)}
        title={pending ? `Deactivate ${pending.name}?` : ''}
        description="The nozzle stays on the list and can be reactivated at any time."
        confirmLabel="Deactivate"
        variant="destructive"
        onConfirm={() => pending && applyToggle(pending)}
        isLoading={toggleStatus.isPending}
      />
    </div>
  )
}
