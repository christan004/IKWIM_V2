import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { FormDialog } from '@/components/form-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { DialogFooter } from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { errorCode, errorMessage } from '@/lib/error-message'
import { useAssignVehicle, useDriver } from '@/features/drivers/use-drivers'
import { useVehicles } from '@/features/vehicles/use-vehicles'
import type { Driver } from '@/api/types'

export function AssignVehicleDialog({
  open,
  onOpenChange,
  driver,
  canReadVehicles,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** The row being assigned; its `transporterId` comes from the detail fetch. */
  driver: Driver | null
  /** Gated on `vehicles.read`, not the drivers permission. */
  canReadVehicles: boolean
}) {
  const assignVehicle = useAssignVehicle()
  // The list omits transporterId, so the driver's own record is fetched to
  // scope the vehicle options.
  const { driver: detail, isLoading: detailLoading } = useDriver(
    open ? driver?.id : undefined,
  )
  const { vehicles, isLoading: vehiclesLoading } = useVehicles({ enabled: canReadVehicles })

  const [vehicleId, setVehicleId] = useState('')

  useEffect(() => {
    if (open) setVehicleId('')
  }, [open])

  /** Vehicles already on this driver, read from the list row's `vehicles`. */
  const assigned = (driver?.vehicles ?? []).map((a) => a.vechile).filter(Boolean)
  const assignedIds = new Set(assigned.map((v) => v.id))

  /**
   * Every active vehicle the driver does not already hold. Vehicles from other
   * transporters are offered too, but grouped separately below — a
   * cross-company assignment should be a deliberate choice, not an accident of
   * alphabetical ordering.
   */
  const candidates = vehicles.filter((v) => v.status === 'active' && !assignedIds.has(v.id))

  const sameTransporter = candidates.filter(
    (v) => detail?.transporterId && v.transporterId === detail.transporterId,
  )
  const otherTransporters = candidates.filter((v) => !sameTransporter.includes(v))

  /** Groups the "other" vehicles by their transporter, so each gets a heading. */
  const otherGroups = otherTransporters.reduce<Record<string, typeof candidates>>(
    (groups, vehicle) => {
      const label = vehicle.transport?.name ?? 'Unknown transporter'
      ;(groups[label] ??= []).push(vehicle)
      return groups
    },
    {},
  )

  /** Named from any vehicle on the same transporter, since the driver record has only the id. */
  const ownTransporterName = sameTransporter[0]?.transport?.name

  function handleAssign() {
    if (!driver || !vehicleId) return
    assignVehicle.mutate(
      { vehicleId, driverId: driver.id },
      {
        onSuccess: () => {
          const plate = vehicles.find((v) => v.id === vehicleId)?.platNumber ?? 'Vehicle'
          toast.success(`${plate} assigned to ${driver.names}`)
          onOpenChange(false)
        },
        onError: (err) => {
          if (errorCode(err) === 'RELATION_CONFLICT') {
            toast.error('The API rejected this pairing', {
              description:
                'It may already be assigned, or the vehicle and driver may belong to different transporters.',
            })
            return
          }
          toast.error(errorMessage(err))
        },
      },
    )
  }

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={`Assign a vehicle to ${driver?.names ?? 'driver'}`}
      description="Any active truck can be assigned. The driver's own transporter is listed first."
    >
      <div className="grid gap-4">
        {assigned.length > 0 && (
          <div className="grid gap-1.5">
            <Label>Currently assigned</Label>
            <div className="flex flex-wrap gap-1.5">
              {assigned.map((vehicle) => (
                <Badge key={vehicle.id} variant="secondary" className="font-mono">
                  {vehicle.platNumber}
                </Badge>
              ))}
            </div>
          </div>
        )}

        <div className="grid gap-1.5">
          <Label htmlFor="vehicleId">
            {assigned.length > 0 ? 'Assign another vehicle' : 'Vehicle'}
          </Label>
          <Select value={vehicleId} onValueChange={setVehicleId}>
            <SelectTrigger id="vehicleId">
              <SelectValue
                placeholder={
                  detailLoading || vehiclesLoading ? 'Loading vehicles…' : 'Select a vehicle'
                }
              />
            </SelectTrigger>
            <SelectContent>
              {sameTransporter.length > 0 && (
                <SelectGroup>
                  <SelectLabel>
                    {detail?.transporterId
                      ? `${ownTransporterName ?? 'Same transporter'} (same)`
                      : 'Same transporter'}
                  </SelectLabel>
                  {sameTransporter.map((vehicle) => (
                    <SelectItem key={vehicle.id} value={vehicle.id}>
                      {vehicle.platNumber}
                      {vehicle.model ? ` — ${vehicle.model}` : ''}
                    </SelectItem>
                  ))}
                </SelectGroup>
              )}

              {Object.entries(otherGroups).map(([label, group]) => (
                <SelectGroup key={label}>
                  <SelectLabel>{label}</SelectLabel>
                  {group.map((vehicle) => (
                    <SelectItem key={vehicle.id} value={vehicle.id}>
                      {vehicle.platNumber}
                      {vehicle.model ? ` — ${vehicle.model}` : ''}
                    </SelectItem>
                  ))}
                </SelectGroup>
              ))}
            </SelectContent>
          </Select>

          {!detailLoading && !vehiclesLoading && candidates.length === 0 && (
            <p className="text-xs text-muted-foreground">
              {assigned.length > 0
                ? 'This driver already holds every active vehicle.'
                : 'There are no active vehicles to assign.'}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleAssign}
            disabled={!vehicleId || assignVehicle.isPending || detailLoading}
          >
            {assignVehicle.isPending ? 'Assigning…' : 'Assign vehicle'}
          </Button>
        </DialogFooter>
      </div>
    </FormDialog>
  )
}
