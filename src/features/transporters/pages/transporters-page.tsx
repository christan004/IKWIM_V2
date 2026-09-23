import { useState } from 'react'
import { Pencil, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { DataTable, type DataTableColumn } from '@/components/data-table'
import { NoAccess } from '@/components/no-access'
import { PERMISSION_MODULES, usePermissions } from '@/hooks/use-permissions'
import { TransporterFormDialog } from '@/features/transporters/components/transporter-form-dialog'
import {
  useToggleTransporterStatus,
  useTransporters,
} from '@/features/transporters/use-transporters'
import { cn } from '@/lib/utils'
import { errorCode, errorMessage } from '@/lib/error-message'
import type { Transporter } from '@/api/types'

export function TransportersPage() {
  const { canRead, canCreate, canEdit } = usePermissions().forModule(
    PERMISSION_MODULES.transporters,
  )
  const { transporters, isLoading, isError, error } = useTransporters({ enabled: canRead })
  const toggleStatus = useToggleTransporterStatus()

  const [createOpen, setCreateOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<Transporter | null>(null)
  /** Which row is mid-request, so its switch can't be flipped twice. */
  const [togglingId, setTogglingId] = useState<string | null>(null)

  function handleToggle(transporter: Transporter) {
    setTogglingId(transporter.id)
    toggleStatus.mutate(transporter.id, {
      onSuccess: (updated) => {
        toast.success(
          `${transporter.name} ${updated?.status === 'active' ? 'activated' : 'deactivated'}`,
          {
            description:
              updated?.status === 'active'
                ? undefined
                : 'It stays on existing records but cannot be chosen for new ones.',
          },
        )
      },
      onError: (err) => toast.error(errorMessage(err)),
      onSettled: () => setTogglingId(null),
    })
  }

  const columns: DataTableColumn<Transporter>[] = [
    {
      header: 'Name',
      cell: (row) => (
        <div>
          <span className="font-medium">{row.name}</span>
          <span className="block text-xs text-muted-foreground">{row.address}</span>
        </div>
      ),
    },
    { header: 'Phone', cell: (row) => row.phone },
    {
      header: 'TIN',
      cell: (row) => <code className="font-mono text-xs">{row.tinNumber}</code>,
    },
    {
      header: 'Status',
      cell: (row) => {
        const isActive = row.status === 'active'
        // The status endpoints in this API flip rather than set, so a second
        // call while one is in flight would silently undo the first.
        const isBusy = togglingId === row.id

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
              onCheckedChange={() => handleToggle(row)}
              aria-label={`${isActive ? 'Deactivate' : 'Activate'} ${row.name}`}
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
            cell: (row: Transporter) => (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setEditTarget(row)}
                title="Edit transporter"
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
          <h1 className="font-display text-2xl font-bold tracking-tight">Transporters</h1>
          <p className="text-sm text-muted-foreground">
            Haulage companies that move stock between locations.
          </p>
        </div>
        {canCreate && (
          <Button onClick={() => setCreateOpen(true)}>
            <Plus />
            New transporter
          </Button>
        )}
      </div>

      {!canRead ? (
        <NoAccess resource="transporters" />
      ) : isError && errorCode(error) === 'FORBIDDEN' ? (
        <NoAccess resource="transporters" variant="rejected" permission="transporters.read" />
      ) : isError ? (
        <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {errorMessage(error)}
        </p>
      ) : (
        <DataTable
          columns={columns}
          data={transporters}
          rowKey={(row) => row.id}
          isLoading={isLoading}
          emptyMessage="No transporters yet. Create the first one to start moving stock."
          getSearchText={(row) => `${row.name} ${row.address} ${row.phone} ${row.tinNumber}`}
          searchPlaceholder="Search transporters…"
          getIsActive={(row) => row.status === 'active'}
          pageSize={15}
        />
      )}

      <TransporterFormDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        existingTransporters={transporters}
      />

      {/* Keyed by id so the form re-seeds when a different row is opened. */}
      <TransporterFormDialog
        key={editTarget?.id ?? 'edit'}
        open={Boolean(editTarget)}
        onOpenChange={(open) => !open && setEditTarget(null)}
        transporter={editTarget}
        existingTransporters={transporters}
      />
    </div>
  )
}
