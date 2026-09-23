import { useState } from 'react'
import { Pencil, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { DataTable, type DataTableColumn } from '@/components/data-table'
import { NoAccess } from '@/components/no-access'
import { PERMISSION_MODULES, usePermissions } from '@/hooks/use-permissions'
import { UnitFormDialog } from '@/features/units/components/unit-form-dialog'
import { useToggleUnitStatus, useUnits } from '@/features/units/use-units'
import { cn } from '@/lib/utils'
import { errorCode, errorMessage } from '@/lib/error-message'
import type { Unit } from '@/api/types'

export function UnitsPage() {
  const { canRead, canCreate, canEdit } = usePermissions().forModule(PERMISSION_MODULES.units)
  // Skip the request entirely when the user may not read the resource.
  const { units, isLoading, isError, error } = useUnits({ enabled: canRead })
  const toggleStatus = useToggleUnitStatus()
  const [createOpen, setCreateOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<Unit | null>(null)
  /** Which row is mid-request, so its switch can't be flipped twice. */
  const [togglingId, setTogglingId] = useState<string | null>(null)

  function handleToggle(unit: Unit) {
    setTogglingId(unit.id)
    toggleStatus.mutate(unit.id, {
      onSuccess: (updated) => {
        toast.success(
          `${unit.name} ${updated?.status === 'active' ? 'activated' : 'deactivated'}`,
          {
            description:
              updated?.status === 'active'
                ? undefined
                : 'It stays on existing items but cannot be chosen for new ones.',
          },
        )
      },
      onError: (err) => toast.error(errorMessage(err)),
      onSettled: () => setTogglingId(null),
    })
  }

  const columns: DataTableColumn<Unit>[] = [
    {
      header: 'Name',
      cell: (unit) => <span className="font-medium">{unit.name}</span>,
    },
    {
      header: 'Code',
      cell: (unit) => (
        <Badge variant="secondary" className="font-mono">
          {unit.code}
        </Badge>
      ),
    },
    {
      header: 'Status',
      cell: (unit) => {
        const isActive = unit.status === 'active'
        // The endpoint flips the status rather than setting it, so a second
        // call while one is in flight would silently undo the first.
        const isBusy = togglingId === unit.id

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
              onCheckedChange={() => handleToggle(unit)}
              aria-label={`${isActive ? 'Deactivate' : 'Activate'} ${unit.name}`}
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
            // There is no delete endpoint, so editing is the only way to
            // correct a unit once it exists.
            cell: (unit: Unit) => (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setEditTarget(unit)}
                title="Edit unit"
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
          <h1 className="font-display text-2xl font-bold tracking-tight">Units</h1>
          <p className="text-sm text-muted-foreground">
            Units of measure used when recording item quantities.
          </p>
        </div>
        {canCreate && (
          <Button onClick={() => setCreateOpen(true)}>
            <Plus />
            New unit
          </Button>
        )}
      </div>

      {!canRead ? (
        <NoAccess resource="units" />
      ) : isError && errorCode(error) === 'FORBIDDEN' ? (
        // The role grants units.read, but the API refused anyway — a
        // server-side gating mismatch, not a missing grant.
        <NoAccess resource="units" variant="rejected" permission="units.read" />
      ) : isError ? (
        <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {errorMessage(error)}
        </p>
      ) : (
        <DataTable
          columns={columns}
          data={units}
          rowKey={(unit) => unit.id}
          isLoading={isLoading}
          emptyMessage="No units yet. Create the first one to start recording quantities."
          getSearchText={(unit) => `${unit.name} ${unit.code}`}
          searchPlaceholder="Search units…"
          pageSize={15}
        />
      )}

      <UnitFormDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        existingUnits={units}
      />

      {/* Keyed by id so the form re-seeds when a different unit is opened. */}
      <UnitFormDialog
        key={editTarget?.id ?? 'edit'}
        open={Boolean(editTarget)}
        onOpenChange={(open) => !open && setEditTarget(null)}
        unit={editTarget}
        existingUnits={units}
      />
    </div>
  )
}
