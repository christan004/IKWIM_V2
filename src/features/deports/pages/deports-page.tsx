import { useState } from 'react'
import { Pencil, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { DataTable, type DataTableColumn } from '@/components/data-table'
import { NoAccess } from '@/components/no-access'
import { PERMISSION_MODULES, usePermissions } from '@/hooks/use-permissions'
import { DeportFormDialog } from '@/features/deports/components/deport-form-dialog'
import { useDeports, useToggleDeportStatus } from '@/features/deports/use-deports'
import { cn } from '@/lib/utils'
import { errorCode, errorMessage } from '@/lib/error-message'
import type { Deport, DeportType } from '@/api/types'

const TYPE_LABEL: Record<DeportType, string> = {
  local: 'Local',
  foreign: 'Foreign',
  international: 'International',
}

export function DeportsPage() {
  const { canRead, canCreate, canEdit } = usePermissions().forModule(PERMISSION_MODULES.deports)
  const { deports, isLoading, isError, error } = useDeports({ enabled: canRead })
  const toggleStatus = useToggleDeportStatus()

  const [createOpen, setCreateOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<Deport | null>(null)
  /** Which row is mid-request, so its switch can't be flipped twice. */
  const [togglingId, setTogglingId] = useState<string | null>(null)

  function handleToggle(deport: Deport) {
    setTogglingId(deport.id)
    toggleStatus.mutate(deport.id, {
      onSuccess: (updated) => {
        toast.success(
          `${deport.name} ${updated?.status === 'active' ? 'activated' : 'deactivated'}`,
        )
      },
      onError: (err) => toast.error(errorMessage(err)),
      onSettled: () => setTogglingId(null),
    })
  }

  const columns: DataTableColumn<Deport>[] = [
    {
      header: 'Name',
      cell: (deport) => (
        <div>
          <span className="font-medium">{deport.name}</span>
          <span className="block text-xs text-muted-foreground">{deport.location}</span>
        </div>
      ),
    },
    {
      header: 'Type',
      cell: (deport) => (
        <Badge variant="secondary">{TYPE_LABEL[deport.type] ?? deport.type}</Badge>
      ),
    },
    {
      header: 'Status',
      cell: (deport) => {
        const isActive = deport.status === 'active'
        // The status endpoints in this API flip rather than set, so a second
        // call while one is in flight would silently undo the first.
        const isBusy = togglingId === deport.id

        // Changing status is an edit; without it the state is read-only.
        if (!canEdit) {
          return (
            <Badge variant={isActive ? 'default' : 'secondary'}>
              {isActive ? 'Active' : 'Inactive'}
            </Badge>
          )
        }

        return (
          <div className="flex items-center gap-2">
            <Switch
              checked={isActive}
              disabled={isBusy}
              onCheckedChange={() => handleToggle(deport)}
              aria-label={`${isActive ? 'Deactivate' : 'Activate'} ${deport.name}`}
            />
            <span className={cn('text-sm', !isActive && 'text-muted-foreground')}>
              {isActive ? 'Active' : 'Inactive'}
            </span>
          </div>
        )
      },
    },
    ...(canEdit
      ? [
          {
            header: '',
            className: 'text-right',
            // There is no delete endpoint, so editing is the only correction path.
            cell: (deport: Deport) => (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setEditTarget(deport)}
                title="Edit deport"
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
          <h1 className="font-display text-2xl font-bold tracking-tight">Deports</h1>
          <p className="text-sm text-muted-foreground">
            Storage depots that stock is held at.
          </p>
        </div>
        {canCreate && (
          <Button onClick={() => setCreateOpen(true)}>
            <Plus />
            New deport
          </Button>
        )}
      </div>

      {!canRead ? (
        <NoAccess resource="deports" />
      ) : isError && errorCode(error) === 'FORBIDDEN' ? (
        <NoAccess resource="deports" variant="rejected" permission="deports.read" />
      ) : isError ? (
        <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {errorMessage(error)}
        </p>
      ) : (
        <DataTable
          columns={columns}
          data={deports}
          rowKey={(deport) => deport.id}
          isLoading={isLoading}
          emptyMessage="No deports yet. Create the first one to start holding stock."
          getSearchText={(deport) => `${deport.name} ${deport.location} ${deport.type}`}
          searchPlaceholder="Search deports…"
          getIsActive={(deport) => deport.status === 'active'}
          pageSize={15}
        />
      )}

      <DeportFormDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        existingDeports={deports}
      />

      {/* Keyed by id so the form re-seeds when a different deport is opened. */}
      <DeportFormDialog
        key={editTarget?.id ?? 'edit'}
        open={Boolean(editTarget)}
        onOpenChange={(open) => !open && setEditTarget(null)}
        deport={editTarget}
        existingDeports={deports}
      />
    </div>
  )
}
