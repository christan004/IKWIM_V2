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
import { errorMessage, fieldErrors } from '@/lib/error-message'
import { useNozzle, useSaveNozzle } from '@/features/nozzles/use-nozzles'
import { usePumps } from '@/features/pumps/use-pumps'
import { useDisplays } from '@/features/displays/use-displays'
import { useCuves } from '@/features/cuves/use-cuves'

const schema = z.object({
  name: z.string().min(1, 'Name is required'),
  nozzleCode: z.string().min(1, 'Code is required'),
  pumpId: z.string().min(1, 'Choose a pump'),
  displayId: z.string().min(1, 'Choose a display'),
  cuveId: z.string().min(1, 'Choose a cuve'),
})

type NozzleForm = z.infer<typeof schema>

const emptyValues: NozzleForm = {
  name: '',
  nozzleCode: '',
  pumpId: '',
  displayId: '',
  cuveId: '',
}

const FIELD_NAMES = ['name', 'nozzleCode', 'pumpId', 'displayId', 'cuveId'] as const

export function NozzleFormDialog({
  open,
  onOpenChange,
  nozzleId,
  canReadPumps,
  canReadDisplays,
  canReadCuves,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Present when editing; the record is fetched to seed the form. */
  nozzleId?: string | null
  /** Gated on `pump.read`, not the nozzle permission. */
  canReadPumps: boolean
  /** Gated on `display.read`. */
  canReadDisplays: boolean
  /** Gated on `cuve.read`. */
  canReadCuves: boolean
}) {
  const saveNozzle = useSaveNozzle()
  const isEdit = Boolean(nozzleId)
  // The list omits all three ids, so editing *must* read the detail endpoint.
  const { nozzle, isLoading: nozzleLoading } = useNozzle(
    open ? (nozzleId ?? undefined) : undefined,
  )
  const { pumps } = usePumps({ enabled: canReadPumps })
  const { displays } = useDisplays({ enabled: canReadDisplays })
  const { cuves } = useCuves({ enabled: canReadCuves })

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    setError,
    watch,
    formState: { errors },
  } = useForm<NozzleForm>({ resolver: zodResolver(schema), defaultValues: emptyValues })

  const pumpId = watch('pumpId')
  const displayId = watch('displayId')
  const cuveId = watch('cuveId')

  /**
   * The pump determines the site, and a nozzle joining equipment from different
   * sites would be meaningless. Whether the API rejects that is unverified —
   * confirming it would need a successful write — so the pickers are filtered
   * instead, which prevents the question arising.
   */
  const chosenPump = pumps.find((p) => p.id === pumpId)
  const siteId = chosenPump?.siteId ?? chosenPump?.site?.id

  /**
   * A display belongs to a pump, so the ones on *this* pump come first. The
   * current value is always kept selectable — Radix falls back to the
   * placeholder if a Select's value has no mounted option, even for one render.
   */
  const selectableDisplays = displays.filter(
    (d) =>
      !pumpId ||
      d.pump?.id === pumpId ||
      d.pumpId === pumpId ||
      d.id === nozzle?.displayId ||
      d.id === displayId,
  )

  /** Cuves are filtered to the pump's site, for the same reason. */
  const selectableCuves = cuves.filter(
    (c) =>
      !siteId ||
      (c.site?.id ?? c.siteId) === siteId ||
      c.id === nozzle?.cuveId ||
      c.id === cuveId,
  )

  useEffect(() => {
    if (!open) return
    reset(
      nozzle
        ? {
            name: nozzle.name ?? '',
            nozzleCode: nozzle.nozzleCode ?? '',
            pumpId: nozzle.pumpId ?? nozzle.pump?.id ?? '',
            displayId: nozzle.displayId ?? nozzle.display?.id ?? '',
            cuveId: nozzle.cuveId ?? nozzle.cuve?.id ?? '',
          }
        : emptyValues,
    )
  }, [open, nozzle, reset])

  /**
   * Changing the pump can invalidate the display and cuve already chosen, so
   * any that no longer belong to the new pump's site are cleared rather than
   * left silently mismatched.
   */
  function handlePumpChange(value: string) {
    setValue('pumpId', value, { shouldValidate: true })

    const nextPump = pumps.find((p) => p.id === value)
    const nextSite = nextPump?.siteId ?? nextPump?.site?.id

    const display = displays.find((d) => d.id === displayId)
    if (display && (display.pump?.id ?? display.pumpId) !== value) {
      setValue('displayId', '', { shouldValidate: true })
    }

    const cuve = cuves.find((c) => c.id === cuveId)
    if (cuve && nextSite && (cuve.site?.id ?? cuve.siteId) !== nextSite) {
      setValue('cuveId', '', { shouldValidate: true })
    }
  }

  function onSubmit(values: NozzleForm) {
    saveNozzle.mutate(
      {
        id: nozzleId ?? undefined,
        name: values.name.trim(),
        nozzleCode: values.nozzleCode.trim(),
        pumpId: values.pumpId,
        displayId: values.displayId,
        cuveId: values.cuveId,
      },
      {
        onSuccess: () => {
          toast.success(isEdit ? 'Nozzle updated' : 'Nozzle created')
          onOpenChange(false)
        },
        onError: (err) => {
          const fields = fieldErrors(err)
          if (fields) {
            let matched = false
            for (const name of FIELD_NAMES) {
              const message = fields[name]
              if (message) {
                setError(name, { message })
                matched = true
              }
            }
            if (matched) return
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
      title={isEdit ? 'Edit nozzle' : 'New nozzle'}
      description="A nozzle, tying a pump to a display and a cuve."
    >
      <form onSubmit={handleSubmit(onSubmit)} className="grid gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label htmlFor="name">Name</Label>
            <Input id="name" placeholder="Nozzle 1" {...register('name')} />
            {errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="nozzleCode">Code</Label>
            <Input id="nozzleCode" placeholder="NZ057383" {...register('nozzleCode')} />
            {errors.nozzleCode && (
              <p className="text-sm text-destructive">{errors.nozzleCode.message}</p>
            )}
          </div>
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="pumpId">Pump</Label>
          <Select value={pumpId} onValueChange={handlePumpChange}>
            <SelectTrigger id="pumpId">
              <SelectValue placeholder="Select a pump" />
            </SelectTrigger>
            <SelectContent>
              {pumps.map((pump) => (
                <SelectItem key={pump.id} value={pump.id}>
                  {pump.name}
                  {/* Pump names repeat across sites, so the site disambiguates. */}
                  {pump.site?.name ? ` — ${pump.site.name}` : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {errors.pumpId ? (
            <p className="text-sm text-destructive">{errors.pumpId.message}</p>
          ) : (
            <p className="text-xs text-muted-foreground">
              {chosenPump?.site?.name
                ? `Displays and cuves are filtered to ${chosenPump.site.name}.`
                : 'Choose the pump first — it determines the site.'}
            </p>
          )}
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="displayId">Display</Label>
          <Select
            value={displayId}
            onValueChange={(v) => setValue('displayId', v, { shouldValidate: true })}
          >
            <SelectTrigger id="displayId">
              <SelectValue placeholder="Select a display" />
            </SelectTrigger>
            <SelectContent>
              {selectableDisplays.map((display) => (
                <SelectItem key={display.id} value={display.id}>
                  {display.name}
                  {display.code ? ` — ${display.code}` : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {errors.displayId ? (
            <p className="text-sm text-destructive">{errors.displayId.message}</p>
          ) : (
            pumpId &&
            selectableDisplays.length === 0 && (
              <p className="text-xs text-muted-foreground">This pump has no displays yet.</p>
            )
          )}
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="cuveId">Cuve</Label>
          <Select
            value={cuveId}
            onValueChange={(v) => setValue('cuveId', v, { shouldValidate: true })}
          >
            <SelectTrigger id="cuveId">
              <SelectValue placeholder="Select a cuve" />
            </SelectTrigger>
            <SelectContent>
              {selectableCuves.map((cuve) => (
                <SelectItem key={cuve.id} value={cuve.id}>
                  {cuve.name}
                  {/* The item is what the nozzle actually dispenses. */}
                  {cuve.item?.name ? ` — ${cuve.item.name}` : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {errors.cuveId ? (
            <p className="text-sm text-destructive">{errors.cuveId.message}</p>
          ) : (
            pumpId &&
            selectableCuves.length === 0 && (
              <p className="text-xs text-muted-foreground">This site has no cuves yet.</p>
            )
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          {/* Saving before the record arrives would submit an empty form over
              the existing nozzle. */}
          <Button type="submit" disabled={saveNozzle.isPending || nozzleLoading}>
            {saveNozzle.isPending
              ? isEdit
                ? 'Saving…'
                : 'Creating…'
              : isEdit
                ? 'Save changes'
                : 'Create nozzle'}
          </Button>
        </DialogFooter>
      </form>
    </FormDialog>
  )
}
