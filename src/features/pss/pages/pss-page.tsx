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
import { SiteFormDialog } from '@/features/pss/components/site-form-dialog'
import { useSites, useToggleSiteStatus } from '@/features/pss/use-pss'
import { errorCode, errorMessage } from '@/lib/error-message'
import type { Site } from '@/api/types'

export function PssPage() {
  const permissions = usePermissions()
  const { canRead, canCreate, canEdit } = permissions.forModule(PERMISSION_MODULES.pss)

  const { sites, isLoading, isError, error } = useSites({ enabled: canRead })
  const toggleStatus = useToggleSiteStatus()

  const [createOpen, setCreateOpen] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  /** The site pending deactivation, once confirmed. */
  const [pending, setPending] = useState<Site | null>(null)
  /** Which row is mid-request, so its switch is disabled while saving. */
  const [savingId, setSavingId] = useState<string | null>(null)

  function applyToggle(site: Site) {
    setSavingId(site.id)
    toggleStatus.mutate(site.id, {
      onSuccess: () => {
        toast.success(
          site.status === 'active' ? `${site.name} deactivated` : `${site.name} activated`,
        )
        setPending(null)
      },
      onError: (err) => toast.error(errorMessage(err)),
      onSettled: () => setSavingId(null),
    })
  }

  function requestToggle(site: Site) {
    // Deactivating takes a site out of use, so it is confirmed; reactivating is
    // harmless and applies straight away.
    if (site.status === 'active') {
      setPending(site)
      return
    }
    applyToggle(site)
  }

  const columns: DataTableColumn<Site>[] = [
    {
      header: 'Site',
      cell: (row) => (
        <div>
          <span className="font-medium">{row.name}</span>
          {/* Optional and null when unset, so the row stays clean without it. */}
          {row.address && (
            <span className="block text-xs text-muted-foreground">{row.address}</span>
          )}
        </div>
      ),
    },
    {
      header: 'Contact',
      cell: (row) => {
        if (!row.phone && !row.email) return <span className="text-muted-foreground">—</span>
        return (
          <div>
            {row.phone && <span className="text-sm">{row.phone}</span>}
            {row.email && (
              <span className="block text-xs text-muted-foreground">{row.email}</span>
            )}
          </div>
        )
      },
    },
    {
      header: 'Status',
      // The endpoint only *toggles* — it takes no target state — so this is a
      // switch rather than the status dropdowns used where a state can be set.
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
            cell: (row: Site) => (
              <Button variant="ghost" size="sm" onClick={() => setEditId(row.id)} title="Edit site">
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
          <h1 className="font-display text-2xl font-bold tracking-tight">PSS</h1>
          <p className="text-sm text-muted-foreground">Sites operating under PSS.</p>
        </div>
        {canCreate && (
          <Button onClick={() => setCreateOpen(true)}>
            <Plus />
            New site
          </Button>
        )}
      </div>

      {!canRead ? (
        <NoAccess resource="sites" />
      ) : isError && errorCode(error) === 'FORBIDDEN' ? (
        <NoAccess resource="sites" variant="rejected" permission="pss.read" />
      ) : isError ? (
        <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {errorMessage(error)}
        </p>
      ) : (
        <DataTable
          columns={columns}
          data={sites}
          rowKey={(row) => row.id}
          isLoading={isLoading}
          emptyMessage="No sites yet. Create the first one to get started."
          getSearchText={(row) =>
            `${row.name} ${row.address ?? ''} ${row.phone ?? ''} ${row.email ?? ''} ${row.status}`
          }
          searchPlaceholder="Search sites…"
          pageSize={15}
        />
      )}

      <SiteFormDialog open={createOpen} onOpenChange={setCreateOpen} />

      {/* Keyed by id so the form re-fetches when a different record is opened. */}
      <SiteFormDialog
        key={editId ?? 'edit'}
        open={Boolean(editId)}
        onOpenChange={(open) => !open && setEditId(null)}
        siteId={editId}
      />

      <ConfirmDialog
        open={Boolean(pending)}
        onOpenChange={(open) => !open && setPending(null)}
        title={pending ? `Deactivate ${pending.name}?` : ''}
        description="The site stays on the list and can be reactivated at any time."
        confirmLabel="Deactivate"
        variant="destructive"
        onConfirm={() => pending && applyToggle(pending)}
        isLoading={toggleStatus.isPending}
      />
    </div>
  )
}
