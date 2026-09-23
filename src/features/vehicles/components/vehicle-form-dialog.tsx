import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { FormDialog } from '@/components/form-dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { DialogFooter } from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { errorCode, errorMessage, fieldErrors } from '@/lib/error-message'
import { useSaveVehicle } from '@/features/vehicles/use-vehicles'
import { useTransporters } from '@/features/transporters/use-transporters'
import type { Vehicle } from '@/api/types'

const schema = z.object({
  platNumber: z.string().trim().min(1, 'Plate number is required'),
  transporterId: z.string().min(1, 'Choose a transporter'),
  truckNumber: z.string().trim().min(1, 'Truck number is required'),
  trailerNumber: z.string().trim().min(1, 'Trailer number is required'),
  model: z.string().trim().min(1, 'Model is required'),
  // Kept as a string for the input, coerced on submit — the API requires a
  // number and rejects a numeric string.
  tankCapacity: z
    .string()
    .min(1, 'Tank capacity is required')
    .refine((v) => Number(v) > 0, 'Must be greater than 0'),
})

type VehicleForm = z.infer<typeof schema>

const emptyValues: VehicleForm = {
  platNumber: '',
  transporterId: '',
  truckNumber: '',
  trailerNumber: '',
  model: '',
  tankCapacity: '',
}

const FIELD_NAMES = [
  'platNumber',
  'transporterId',
  'truckNumber',
  'trailerNumber',
  'model',
  'tankCapacity',
] as const

export function VehicleFormDialog({
  open,
  onOpenChange,
  vehicle,
  existingVehicles,
  canReadTransporters,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Present when editing; omitted when creating. */
  vehicle?: Vehicle | null
  /** Used to warn about duplicate plate numbers before hitting the API. */
  existingVehicles: Vehicle[]
  /** Gated on `transporters.read`, not the vehicles permission. */
  canReadTransporters: boolean
}) {
  const saveVehicle = useSaveVehicle()
  const { transporters, isLoading: transportersLoading } = useTransporters({
    enabled: canReadTransporters,
  })

  const isEdit = Boolean(vehicle)

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    setError,
    watch,
    formState: { errors },
  } = useForm<VehicleForm>({ resolver: zodResolver(schema), defaultValues: emptyValues })

  const transporterId = watch('transporterId')

  /**
   * An inactive transporter stays selectable on the vehicle that already uses
   * it. The **currently selected id** is included too: Radix matches a Select's
   * value against a mounted `SelectItem`, and if the option is missing for even
   * one render the trigger falls back to its placeholder.
   */
  const selectableTransporters = transporters.filter(
    (t) =>
      t.status === 'active' || t.id === vehicle?.transporterId || t.id === transporterId,
  )

  useEffect(() => {
    if (!open) return
    reset(
      vehicle
        ? {
            platNumber: vehicle.platNumber,
            transporterId: vehicle.transporterId,
            truckNumber: vehicle.truckNumber,
            trailerNumber: vehicle.trailerNumber,
            model: vehicle.model,
            // Returned as a string, so it drops straight into the input.
            tankCapacity: String(vehicle.tankCapacity),
          }
        : emptyValues,
    )
  }, [open, vehicle, reset])

  function onSubmit(values: VehicleForm) {
    const platNumber = values.platNumber.trim().toUpperCase()

    // A plate number identifies one truck, so a repeat is almost always a typo.
    const clash = existingVehicles.find(
      (v) => v.id !== vehicle?.id && v.platNumber.toUpperCase() === platNumber,
    )
    if (clash) {
      setError('platNumber', { message: `Already used by ${clash.platNumber}.` })
      return
    }

    saveVehicle.mutate(
      {
        id: vehicle?.id,
        platNumber,
        transporterId: values.transporterId,
        truckNumber: values.truckNumber.trim(),
        trailerNumber: values.trailerNumber.trim(),
        model: values.model.trim(),
        tankCapacity: Number(values.tankCapacity),
      },
      {
        onSuccess: () => {
          toast.success(
            isEdit ? `Vehicle ${platNumber} updated` : `Vehicle ${platNumber} created`,
          )
          onOpenChange(false)
        },
        onError: (err) => {
          const fields = fieldErrors(err)
          if (fields) {
            let matched = false
            for (const field of FIELD_NAMES) {
              const message = fields[field]
              if (message) {
                setError(field, { message })
                matched = true
              }
            }
            if (matched) return
          }
          if (errorCode(err) === 'RESOURCE_CONFLICT') {
            setError('platNumber', { message: 'A vehicle with this plate already exists.' })
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
      title={isEdit ? 'Edit vehicle' : 'New vehicle'}
      description="Trucks belonging to a transporter."
    >
      <form onSubmit={handleSubmit(onSubmit)} className="grid gap-4">
        <div className="grid gap-1.5">
          <Label htmlFor="platNumber">Plate number</Label>
          <Input
            id="platNumber"
            placeholder="RAB74834"
            className="font-mono uppercase"
            {...register('platNumber')}
          />
          {errors.platNumber && (
            <p className="text-sm text-destructive">{errors.platNumber.message}</p>
          )}
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="transporterId">Transporter</Label>
          <Select
            value={transporterId}
            onValueChange={(v) => setValue('transporterId', v, { shouldValidate: true })}
          >
            <SelectTrigger id="transporterId">
              <SelectValue
                placeholder={transportersLoading ? 'Loading transporters…' : 'Select a transporter'}
              />
            </SelectTrigger>
            <SelectContent>
              {selectableTransporters.map((transporter) => (
                <SelectItem key={transporter.id} value={transporter.id}>
                  {transporter.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {errors.transporterId && (
            <p className="text-sm text-destructive">{errors.transporterId.message}</p>
          )}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label htmlFor="truckNumber">Truck number</Label>
            <Input id="truckNumber" placeholder="33333333" {...register('truckNumber')} />
            {errors.truckNumber && (
              <p className="text-sm text-destructive">{errors.truckNumber.message}</p>
            )}
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="trailerNumber">Trailer number</Label>
            <Input id="trailerNumber" placeholder="8494" {...register('trailerNumber')} />
            {errors.trailerNumber && (
              <p className="text-sm text-destructive">{errors.trailerNumber.message}</p>
            )}
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label htmlFor="model">Model</Label>
            <Input id="model" placeholder="334" {...register('model')} />
            {errors.model && <p className="text-sm text-destructive">{errors.model.message}</p>}
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="tankCapacity">Tank capacity</Label>
            <Input
              id="tankCapacity"
              type="number"
              min="0"
              step="any"
              placeholder="344"
              {...register('tankCapacity')}
            />
            {errors.tankCapacity && (
              <p className="text-sm text-destructive">{errors.tankCapacity.message}</p>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" disabled={saveVehicle.isPending}>
            {saveVehicle.isPending
              ? isEdit
                ? 'Saving…'
                : 'Creating…'
              : isEdit
                ? 'Save changes'
                : 'Create vehicle'}
          </Button>
        </DialogFooter>
      </form>
    </FormDialog>
  )
}
