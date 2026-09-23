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
import { PumpFormDialog } from '@/features/pumps/components/pump-form-dialog'
import { usePumps, useTogglePumpStatus } from '@/features/pumps/use-pumps'
import { useSites } from '@/features/pss/use-pss'
import { errorCode, errorMessage } from '@/lib/error-message'
import type { Pump, UnitStatus } from '@/api/types'

export function PumpsPage() {
  const permissions = usePermissions()
  const { canRead, canCreate, canEdit } = permissions.forModule(PERMISSION_MODULES.pump)
  // Sites are a separate module, so the picker is gated on its own permission.
  const canReadSites = permissions.forModule(PERMISSION_MODULES.pss).canRead

  const { pumps, isLoading, isError, error } = usePumps({ enabled: canRead })
  // The pumps list omits `status`, but sites nest their pumps *with* it — and
  // sites are already loaded for the picker, so this costs no extra request.
  const { sites } = useSites({ enabled: canRead && canReadSites })
  const toggleStatus = useTogglePumpStatus()

  const [createOpen, setCreateOpen] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [pending, setPending] = useState<{ pump: Pump; status: UnitStatus } | null>(null)
  /** Which row is mid-request, so its switch is disabled while saving. */
  const [savingId, setSavingId] = useState<string | null>(null)

  /** Resolves a pump status from the site that nests it. */
  const statusOf = (pump: Pump): UnitStatus | undefined =>
    pump.status ?? sites.flatMap((s) => s.pumps ?? []).find((p) => p.id === pump.id)?.status

  function applyToggle(pump: Pump, status: UnitStatus) {
    setSavingId(pump.id)
    toggleStatus.mutate(pump.id, {
      onSuccess: () => {
        toast.success(status === 'active' ? `${pump.name} deactivated` : `${pump.name} activated`)
        setPending(null)
      },
      onError: (err) => toast.error(errorMessage(err)),
      onSettled: () => setSavingId(null),
    })
  }

  function requestToggle(pump: Pump, status: UnitStatus) {
    // Deactivating takes a pump out of use, so it is confirmed; reactivating is
    // harmless and applies straight away.
    if (status === 'active') {
      setPending({ pump, status })
      return
    }
    applyToggle(pump, status)
  }

  const columns: DataTableColumn<Pump>[] = [
    {
      header: 'Pump',
      cell: (row) => <span className="font-medium">{row.name}</span>,
    },
    {
      header: 'Site',
      // The list nests the whole site, so no lookup is needed here.
      cell: (row) => {
        const site = row.site ?? sites.find((s) => s.id === row.siteId)
        if (!site) return <span className="text-muted-foreground">—</span>
        return (
          <div>
            <span className="text-sm">{site.name}</span>
            {site.address && (
              <span className="block text-xs text-muted-foreground">{site.address}</span>
            )}
          </div>
        )
      },
    },
    {
      header: 'Status',
      // The endpoint only *toggles* — it takes no target state — so this is a
      // switch rather than a status dropdown.
      cell: (row) => {
        const status = statusOf(row)
        if (!status) return <span className="text-xs text-muted-foreground">—</span>

        return canEdit ? (
          <div className="flex items-center gap-2">
            <Switch
              checked={status === 'active'}
              disabled={savingId === row.id}
              onCheckedChange={() => requestToggle(row, status)}
              aria-label={`Toggle ${row.name}`}
            />
            <span className="text-xs text-muted-foreground">{status}</span>
          </div>
        ) : (
          <Badge variant={status === 'active' ? 'default' : 'outline'}>{status}</Badge>
        )
      },
    },
    ...(canEdit
      ? [
          {
            header: '',
            className: 'text-right',
            // There is no delete endpoint, so editing is the only correction path.
            cell: (row: Pump) => (
              <Button variant="ghost" size="sm" onClick={() => setEditId(row.id)} title="Edit pump">
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
          <h1 className="font-display text-2xl font-bold tracking-tight">Pumps</h1>
          <p className="text-sm text-muted-foreground">Pumps installed at your sites.</p>
        </div>
        {canCreate && (
          <Button onClick={() => setCreateOpen(true)}>
            <Plus />
            New pump
          </Button>
        )}
      </div>

      {!canRead ? (
        <NoAccess resource="pumps" />
      ) : isError && errorCode(error) === 'FORBIDDEN' ? (
        <NoAccess resource="pumps" variant="rejected" permission="pump.read" />
      ) : isError ? (
        <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {errorMessage(error)}
        </p>
      ) : (
        <DataTable
          columns={columns}
          data={pumps}
          rowKey={(row) => row.id}
          isLoading={isLoading}
          emptyMessage="No pumps yet. Add one to a site to get started."
          getSearchText={(row) =>
            `${row.name} ${row.site?.name ?? ''} ${row.site?.address ?? ''} ${statusOf(row) ?? ''}`
          }
          searchPlaceholder="Search pumps…"
          pageSize={15}
        />
      )}

      <PumpFormDialog open={createOpen} onOpenChange={setCreateOpen} canReadSites={canReadSites} />

      {/* Keyed by id so the form re-fetches when a different record is opened. */}
      <PumpFormDialog
        key={editId ?? 'edit'}
        open={Boolean(editId)}
        onOpenChange={(open) => !open && setEditId(null)}
        pumpId={editId}
        canReadSites={canReadSites}
      />

      <ConfirmDialog
        open={Boolean(pending)}
        onOpenChange={(open) => !open && setPending(null)}
        title={pending ? `Deactivate ${pending.pump.name}?` : ''}
        description="The pump stays on the list and can be reactivated at any time."
        confirmLabel="Deactivate"
        variant="destructive"
        onConfirm={() => pending && applyToggle(pending.pump, pending.status)}
        isLoading={toggleStatus.isPending}
      />
    </div>
  )
}
