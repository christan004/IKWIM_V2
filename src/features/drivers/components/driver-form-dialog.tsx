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
import { useDriver, useSaveDriver } from '@/features/drivers/use-drivers'
import { useTransporters } from '@/features/transporters/use-transporters'
import type { Driver } from '@/api/types'

const schema = z.object({
  names: z.string().trim().min(1, 'Name is required'),
  phone: z.string().trim().min(1, 'Phone is required'),
  lisence: z.string().trim().min(1, 'Licence is required'),
  passport: z.string().trim().min(1, 'Passport is required'),
  transporterId: z.string().min(1, 'Choose a transporter'),
})

type DriverForm = z.infer<typeof schema>

const emptyValues: DriverForm = {
  names: '',
  phone: '',
  lisence: '',
  passport: '',
  transporterId: '',
}

/**
 * The API accepts `paassport` but returns `passport`, so the request field is
 * mapped separately from the form field. `FIELD_NAMES` covers both spellings so
 * a server-side error lands on the right input either way.
 */
const FIELD_MAP: Record<string, keyof DriverForm> = {
  names: 'names',
  phone: 'phone',
  lisence: 'lisence',
  passport: 'passport',
  paassport: 'passport',
  transporterId: 'transporterId',
}

export function DriverFormDialog({
  open,
  onOpenChange,
  driverId,
  existingDrivers,
  canReadTransporters,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /**
   * Present when editing. The list omits `transporterId`, so the form fetches
   * the record rather than being handed a row.
   */
  driverId?: string | null
  /** Used to warn about a duplicate licence before hitting the API. */
  existingDrivers: Driver[]
  /** Gated on `transporters.read`, not the drivers permission. */
  canReadTransporters: boolean
}) {
  const saveDriver = useSaveDriver()
  const isEdit = Boolean(driverId)
  const { driver, isLoading: driverLoading } = useDriver(
    open ? (driverId ?? undefined) : undefined,
  )
  const { transporters, isLoading: transportersLoading } = useTransporters({
    enabled: canReadTransporters,
  })

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    setError,
    watch,
    formState: { errors },
  } = useForm<DriverForm>({ resolver: zodResolver(schema), defaultValues: emptyValues })

  const transporterId = watch('transporterId')

  /**
   * An inactive transporter stays selectable on the driver that already uses
   * it. The **currently selected id** is included too: Radix matches a Select's
   * value against a mounted `SelectItem`, and if the option is missing for even
   * one render the trigger falls back to its placeholder.
   */
  const selectableTransporters = transporters.filter(
    (t) =>
      t.status === 'active' || t.id === driver?.transporterId || t.id === transporterId,
  )

  useEffect(() => {
    if (!open) return
    reset(
      driver
        ? {
            names: driver.names,
            phone: driver.phone,
            lisence: driver.lisence,
            passport: driver.passport,
            transporterId: driver.transporterId ?? '',
          }
        : emptyValues,
    )
  }, [open, driver, reset])

  function onSubmit(values: DriverForm) {
    const lisence = values.lisence.trim()

    // A licence number identifies one person, so a repeat is almost always a typo.
    const clash = existingDrivers.find(
      (d) => d.id !== driverId && d.lisence.toLowerCase() === lisence.toLowerCase(),
    )
    if (clash) {
      setError('lisence', { message: `Already used by ${clash.names}.` })
      return
    }

    saveDriver.mutate(
      {
        id: driverId ?? undefined,
        names: values.names.trim(),
        phone: values.phone.trim(),
        lisence,
        // The request spelling differs from the response spelling.
        paassport: values.passport.trim(),
        transporterId: values.transporterId,
      },
      {
        onSuccess: () => {
          toast.success(
            isEdit ? `Driver "${values.names}" updated` : `Driver "${values.names}" created`,
          )
          onOpenChange(false)
        },
        onError: (err) => {
          const fields = fieldErrors(err)
          if (fields) {
            let matched = false
            for (const [apiField, formField] of Object.entries(FIELD_MAP)) {
              const message = fields[apiField]
              if (message) {
                setError(formField, { message })
                matched = true
              }
            }
            if (matched) return
          }
          if (errorCode(err) === 'RESOURCE_CONFLICT') {
            setError('lisence', { message: 'A driver with these details already exists.' })
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
      title={isEdit ? 'Edit driver' : 'New driver'}
      description="People who drive for your transporters."
    >
      <form onSubmit={handleSubmit(onSubmit)} className="grid gap-4">
        <div className="grid gap-1.5">
          <Label htmlFor="names">Name</Label>
          <Input id="names" placeholder="Pascal" {...register('names')} />
          {errors.names && <p className="text-sm text-destructive">{errors.names.message}</p>}
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="transporterId">Transporter</Label>
          <Select
            value={transporterId}
            onValueChange={(v) => setValue('transporterId', v, { shouldValidate: true })}
          >
            <SelectTrigger id="transporterId">
              <SelectValue
                placeholder={
                  transportersLoading ? 'Loading transporters…' : 'Select a transporter'
                }
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

        <div className="grid gap-1.5">
          <Label htmlFor="phone">Phone</Label>
          <Input id="phone" inputMode="tel" placeholder="0787869600" {...register('phone')} />
          {errors.phone && <p className="text-sm text-destructive">{errors.phone.message}</p>}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label htmlFor="lisence">Licence</Label>
            <Input id="lisence" placeholder="75urir" className="font-mono" {...register('lisence')} />
            {errors.lisence && (
              <p className="text-sm text-destructive">{errors.lisence.message}</p>
            )}
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="passport">Passport</Label>
            <Input
              id="passport"
              placeholder="64yu3uee"
              className="font-mono"
              {...register('passport')}
            />
            {errors.passport && (
              <p className="text-sm text-destructive">{errors.passport.message}</p>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          {/* Saving before the record arrives would submit an empty form over
              the existing driver. */}
          <Button type="submit" disabled={saveDriver.isPending || driverLoading}>
            {saveDriver.isPending
              ? isEdit
                ? 'Saving…'
                : 'Creating…'
              : isEdit
                ? 'Save changes'
                : 'Create driver'}
          </Button>
        </DialogFooter>
      </form>
    </FormDialog>
  )
}
