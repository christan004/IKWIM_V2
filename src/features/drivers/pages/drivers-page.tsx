import { useState } from 'react'
import { Pencil, Plus, Truck } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { DataTable, type DataTableColumn } from '@/components/data-table'
import { NoAccess } from '@/components/no-access'
import { PERMISSION_MODULES, usePermissions } from '@/hooks/use-permissions'
import { DriverFormDialog } from '@/features/drivers/components/driver-form-dialog'
import { AssignVehicleDialog } from '@/features/drivers/components/assign-vehicle-dialog'
import { useDrivers, useToggleDriverStatus } from '@/features/drivers/use-drivers'
import { cn } from '@/lib/utils'
import { errorCode, errorMessage } from '@/lib/error-message'
import type { Driver } from '@/api/types'

export function DriversPage() {
  const permissions = usePermissions()
  const { canRead, canCreate, canEdit } = permissions.forModule(PERMISSION_MODULES.drivers)
  // The transporters query is shared with its own page, so it is gated on
  // `transporters.read` rather than the drivers permission.
  const canReadTransporters = permissions.forModule(PERMISSION_MODULES.transporters).canRead
  const canReadVehicles = permissions.forModule(PERMISSION_MODULES.vehicles).canRead

  const { drivers, isLoading, isError, error } = useDrivers({ enabled: canRead })
  const toggleStatus = useToggleDriverStatus()

  const [createOpen, setCreateOpen] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [assignTarget, setAssignTarget] = useState<Driver | null>(null)
  /** Which row is mid-request, so its switch can't be flipped twice. */
  const [togglingId, setTogglingId] = useState<string | null>(null)

  function handleToggle(driver: Driver) {
    setTogglingId(driver.id)
    toggleStatus.mutate(driver.id, {
      onSuccess: (updated) => {
        toast.success(
          `${driver.names} ${updated?.status === 'active' ? 'activated' : 'deactivated'}`,
        )
      },
      onError: (err) => toast.error(errorMessage(err)),
      onSettled: () => setTogglingId(null),
    })
  }

  const columns: DataTableColumn<Driver>[] = [
    {
      header: 'Name',
      cell: (row) => (
        <div>
          <span className="font-medium">{row.names}</span>
          <span className="block text-xs text-muted-foreground">{row.phone}</span>
        </div>
      ),
    },
    {
      header: 'Licence',
      cell: (row) => <code className="font-mono text-xs">{row.lisence}</code>,
    },
    {
      header: 'Passport',
      cell: (row) => <code className="font-mono text-xs">{row.passport}</code>,
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
              aria-label={`${isActive ? 'Deactivate' : 'Activate'} ${row.names}`}
            />
            <span className={cn('text-sm', !isActive && 'text-muted-foreground')}>
              {isActive ? 'Active' : 'Inactive'}
            </span>
          </div>
        )
      },
    },
    {
      header: 'Vehicle',
      cell: (row) => {
        // Each entry wraps the vehicle under `vechile` — the API's spelling.
        const assigned = (row.vehicles ?? []).map((a) => a.vechile).filter(Boolean)
        if (assigned.length === 0) {
          return <span className="text-muted-foreground">—</span>
        }
        return (
          <div className="flex flex-wrap gap-1">
            {assigned.map((vehicle) => (
              <Badge
                key={vehicle.id}
                variant={vehicle.status === 'active' ? 'secondary' : 'outline'}
                className="font-mono"
                title={vehicle.model ? `Model ${vehicle.model}` : undefined}
              >
                {vehicle.platNumber}
              </Badge>
            ))}
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
            cell: (row: Driver) => (
              <div className="flex items-center justify-end gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setAssignTarget(row)}
                  title="Assign a vehicle"
                >
                  <Truck className="size-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setEditId(row.id)}
                  title="Edit driver"
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
          <h1 className="font-display text-2xl font-bold tracking-tight">Drivers</h1>
          <p className="text-sm text-muted-foreground">
            People who drive for your transporters.
          </p>
        </div>
        {canCreate && (
          <Button onClick={() => setCreateOpen(true)}>
            <Plus />
            New driver
          </Button>
        )}
      </div>

      {!canRead ? (
        <NoAccess resource="drivers" />
      ) : isError && errorCode(error) === 'FORBIDDEN' ? (
        <NoAccess resource="drivers" variant="rejected" permission="drivers.read" />
      ) : isError ? (
        <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {errorMessage(error)}
        </p>
      ) : (
        <DataTable
          columns={columns}
          data={drivers}
          rowKey={(row) => row.id}
          isLoading={isLoading}
          emptyMessage="No drivers yet. Create the first one to assign them to trips."
          getSearchText={(row) => `${row.names} ${row.phone} ${row.lisence} ${row.passport}`}
          searchPlaceholder="Search drivers…"
          getIsActive={(row) => row.status === 'active'}
          pageSize={15}
        />
      )}

      <DriverFormDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        existingDrivers={drivers}
        canReadTransporters={canReadTransporters}
      />

      {/* Keyed by id so the form re-fetches when a different driver is opened. */}
      <DriverFormDialog
        key={editId ?? 'edit'}
        open={Boolean(editId)}
        onOpenChange={(open) => !open && setEditId(null)}
        driverId={editId}
        existingDrivers={drivers}
        canReadTransporters={canReadTransporters}
      />

      {/* Keyed by id so the vehicle options re-scope to the chosen driver. */}
      <AssignVehicleDialog
        key={assignTarget?.id ?? 'assign'}
        open={Boolean(assignTarget)}
        onOpenChange={(open) => !open && setAssignTarget(null)}
        driver={assignTarget}
        canReadVehicles={canReadVehicles}
      />
    </div>
  )
}
