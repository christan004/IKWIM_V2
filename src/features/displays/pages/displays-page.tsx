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
import { DisplayFormDialog } from '@/features/displays/components/display-form-dialog'
import { useDisplays, useToggleDisplayStatus } from '@/features/displays/use-displays'
import { useSites } from '@/features/pss/use-pss'
import { errorCode, errorMessage } from '@/lib/error-message'
import type { Display } from '@/api/types'

export function DisplaysPage() {
  const permissions = usePermissions()
  const { canRead, canCreate, canEdit } = permissions.forModule(PERMISSION_MODULES.display)
  // Pumps and sites are separate modules, each gated on its own permission.
  const canReadPumps = permissions.forModule(PERMISSION_MODULES.pump).canRead
  const canReadSites = permissions.forModule(PERMISSION_MODULES.pss).canRead

  const { displays, isLoading, isError, error } = useDisplays({ enabled: canRead })
  // The nested pump carries only a `siteId`, so naming the site needs the
  // sites list — the chain is site → pump → display.
  const { sites } = useSites({ enabled: canRead && canReadSites })
  const toggleStatus = useToggleDisplayStatus()

  const [createOpen, setCreateOpen] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [pending, setPending] = useState<Display | null>(null)
  /** Which row is mid-request, so its switch is disabled while saving. */
  const [savingId, setSavingId] = useState<string | null>(null)

  /** The site a display sits at, resolved through its pump. */
  const siteOf = (display: Display) =>
    sites.find((s) => s.id === display.pump?.siteId)

  function applyToggle(display: Display) {
    setSavingId(display.id)
    toggleStatus.mutate(display.id, {
      onSuccess: () => {
        toast.success(
          display.status === 'active'
            ? `${display.name} deactivated`
            : `${display.name} activated`,
        )
        setPending(null)
      },
      onError: (err) => toast.error(errorMessage(err)),
      onSettled: () => setSavingId(null),
    })
  }

  function requestToggle(display: Display) {
    // Deactivating takes a display out of use, so it is confirmed;
    // reactivating is harmless and applies straight away.
    if (display.status === 'active') {
      setPending(display)
      return
    }
    applyToggle(display)
  }

  const columns: DataTableColumn<Display>[] = [
    {
      header: 'Display',
      cell: (row) => (
        <div>
          <span className="font-medium">{row.name}</span>
          <span className="block font-mono text-xs text-muted-foreground">{row.code}</span>
        </div>
      ),
    },
    {
      header: 'Pump',
      // The list nests the whole pump, so only the site needs resolving.
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
      header: 'Status',
      // Present on the list here, unlike pumps — no second source needed. The
      // endpoint only *toggles*, so this is a switch rather than a dropdown.
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
            cell: (row: Display) => (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setEditId(row.id)}
                title="Edit display"
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
          <h1 className="font-display text-2xl font-bold tracking-tight">Displays</h1>
          <p className="text-sm text-muted-foreground">Displays attached to your pumps.</p>
        </div>
        {canCreate && (
          <Button onClick={() => setCreateOpen(true)}>
            <Plus />
            New display
          </Button>
        )}
      </div>

      {!canRead ? (
        <NoAccess resource="displays" />
      ) : isError && errorCode(error) === 'FORBIDDEN' ? (
        <NoAccess resource="displays" variant="rejected" permission="display.read" />
      ) : isError ? (
        <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {errorMessage(error)}
        </p>
      ) : (
        <DataTable
          columns={columns}
          data={displays}
          rowKey={(row) => row.id}
          isLoading={isLoading}
          emptyMessage="No displays yet. Attach one to a pump to get started."
          getSearchText={(row) =>
            `${row.name} ${row.code} ${row.pump?.name ?? ''} ${siteOf(row)?.name ?? ''} ${row.status}`
          }
          searchPlaceholder="Search displays…"
          pageSize={15}
        />
      )}

      <DisplayFormDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        canReadPumps={canReadPumps}
      />

      {/* Keyed by id so the form re-fetches when a different record is opened. */}
      <DisplayFormDialog
        key={editId ?? 'edit'}
        open={Boolean(editId)}
        onOpenChange={(open) => !open && setEditId(null)}
        displayId={editId}
        canReadPumps={canReadPumps}
      />

      <ConfirmDialog
        open={Boolean(pending)}
        onOpenChange={(open) => !open && setPending(null)}
        title={pending ? `Deactivate ${pending.name}?` : ''}
        description="The display stays on the list and can be reactivated at any time."
        confirmLabel="Deactivate"
        variant="destructive"
        onConfirm={() => pending && applyToggle(pending)}
        isLoading={toggleStatus.isPending}
      />
    </div>
  )
}
