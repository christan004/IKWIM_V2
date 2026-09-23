import { useState } from 'react'
import { Pencil, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { DataTable, type DataTableColumn } from '@/components/data-table'
import { NoAccess } from '@/components/no-access'
import { PERMISSION_MODULES, usePermissions } from '@/hooks/use-permissions'
import { VehicleFormDialog } from '@/features/vehicles/components/vehicle-form-dialog'
import { useToggleVehicleStatus, useVehicles } from '@/features/vehicles/use-vehicles'
import { cn } from '@/lib/utils'
import { errorCode, errorMessage } from '@/lib/error-message'
import type { Vehicle } from '@/api/types'

/** `tankCapacity` arrives as a string, so it is parsed before formatting. */
function formatCapacity(value: string): string {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed.toLocaleString() : value
}

export function VehiclesPage() {
  const permissions = usePermissions()
  const { canRead, canCreate, canEdit } = permissions.forModule(PERMISSION_MODULES.vehicles)
  // The transporters query is shared with its own page, so it is gated on
  // `transporters.read` rather than the vehicles permission.
  const canReadTransporters = permissions.forModule(PERMISSION_MODULES.transporters).canRead

  const { vehicles, isLoading, isError, error } = useVehicles({ enabled: canRead })
  const toggleStatus = useToggleVehicleStatus()

  const [createOpen, setCreateOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<Vehicle | null>(null)
  /** Which row is mid-request, so its switch can't be flipped twice. */
  const [togglingId, setTogglingId] = useState<string | null>(null)

  function handleToggle(vehicle: Vehicle) {
    setTogglingId(vehicle.id)
    toggleStatus.mutate(vehicle.id, {
      onSuccess: (updated) => {
        toast.success(
          `${vehicle.platNumber} ${updated?.status === 'active' ? 'activated' : 'deactivated'}`,
        )
      },
      onError: (err) => toast.error(errorMessage(err)),
      onSettled: () => setTogglingId(null),
    })
  }

  const columns: DataTableColumn<Vehicle>[] = [
    {
      header: 'Plate',
      cell: (row) => (
        <div>
          <code className="font-mono font-medium">{row.platNumber}</code>
          <span className="block text-xs text-muted-foreground">Model {row.model}</span>
        </div>
      ),
    },
    {
      header: 'Transporter',
      cell: (row) =>
        row.transport?.name ? (
          <div>
            <span>{row.transport.name}</span>
            {row.transport.address && (
              <span className="block text-xs text-muted-foreground">
                {row.transport.address}
              </span>
            )}
          </div>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      header: 'Truck / Trailer',
      cell: (row) => (
        <span className="font-mono text-xs">
          {row.truckNumber} / {row.trailerNumber}
        </span>
      ),
    },
    {
      header: 'Capacity',
      cell: (row) => <span className="tabular-nums">{formatCapacity(row.tankCapacity)}</span>,
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
              aria-label={`${isActive ? 'Deactivate' : 'Activate'} ${row.platNumber}`}
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
            cell: (row: Vehicle) => (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setEditTarget(row)}
                title="Edit vehicle"
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
          <h1 className="font-display text-2xl font-bold tracking-tight">Vehicles</h1>
          <p className="text-sm text-muted-foreground">
            Trucks belonging to your transporters.
          </p>
        </div>
        {canCreate && (
          <Button onClick={() => setCreateOpen(true)}>
            <Plus />
            New vehicle
          </Button>
        )}
      </div>

      {!canRead ? (
        <NoAccess resource="vehicles" />
      ) : isError && errorCode(error) === 'FORBIDDEN' ? (
        <NoAccess resource="vehicles" variant="rejected" permission="vehicles.read" />
      ) : isError ? (
        <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {errorMessage(error)}
        </p>
      ) : (
        <DataTable
          columns={columns}
          data={vehicles}
          rowKey={(row) => row.id}
          isLoading={isLoading}
          emptyMessage="No vehicles yet. Create the first one to start moving stock."
          getSearchText={(row) =>
            `${row.platNumber} ${row.model} ${row.truckNumber} ${row.trailerNumber} ${row.transport?.name ?? ''}`
          }
          searchPlaceholder="Search vehicles…"
          getIsActive={(row) => row.status === 'active'}
          pageSize={15}
        />
      )}

      <VehicleFormDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        existingVehicles={vehicles}
        canReadTransporters={canReadTransporters}
      />

      {/* Keyed by id so the form re-seeds when a different vehicle is opened. */}
      <VehicleFormDialog
        key={editTarget?.id ?? 'edit'}
        open={Boolean(editTarget)}
        onOpenChange={(open) => !open && setEditTarget(null)}
        vehicle={editTarget}
        existingVehicles={vehicles}
        canReadTransporters={canReadTransporters}
      />
    </div>
  )
}
