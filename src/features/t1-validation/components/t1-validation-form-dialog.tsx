import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { FormDialog } from '@/components/form-dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { DialogFooter } from '@/components/ui/dialog'
import { errorMessage, fieldErrors } from '@/lib/error-message'
import { useCreateT1Validation } from '@/features/t1-validation/use-t1-validation'
import { useNominations } from '@/features/nominations/use-nominations'

const schema = z.object({
  nominationId: z.string().min(1, 'Choose a nomination'),
  exportingCountry: z.string().min(1, 'Exporting country is required'),
  customOffice: z.string().min(1, 'Customs office is required'),
  transitNumbering: z.string().min(1, 'Transit numbering is required'),
})

type T1Form = z.infer<typeof schema>

const emptyValues: T1Form = {
  nominationId: '',
  exportingCountry: '',
  customOffice: '',
  transitNumbering: '',
}

const FIELD_NAMES = [
  'nominationId',
  'exportingCountry',
  'customOffice',
  'transitNumbering',
] as const

/**
 * Create only — the API exposes no update endpoint for T1 validations, so there
 * is no edit mode and nothing to seed from an existing record.
 */
export function T1ValidationFormDialog({
  open,
  onOpenChange,
  nominationId: presetNominationId,
  canReadNominations,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /**
   * The nomination to validate, when raised from a PFI. A T1 belongs to a
   * **nomination**, not to a PFI — the PFI page simply passes its own
   * `nominationId` through, so the nomination is given rather than picked.
   */
  nominationId?: string | null
  /** Gated on `nominations.read`, not the T1 permission. */
  canReadNominations: boolean
}) {
  const createValidation = useCreateT1Validation()
  const { nominations } = useNominations({ enabled: canReadNominations })
  const [file, setFile] = useState<File | null>(null)

  const {
    register,
    handleSubmit,
    reset,
    setError,
    watch,
    formState: { errors },
  } = useForm<T1Form>({ resolver: zodResolver(schema), defaultValues: emptyValues })

  const nominationId = watch('nominationId')
  /** Shown read-only — the PFI that raised this already chose it. */
  const chosenNomination = nominations.find((n) => n.id === nominationId)

  useEffect(() => {
    if (!open) return
    reset({ ...emptyValues, nominationId: presetNominationId ?? '' })
    setFile(null)
  }, [open, presetNominationId, reset])

  function onSubmit(values: T1Form) {
    createValidation.mutate(
      {
        nominationId: values.nominationId,
        exportingCountry: values.exportingCountry.trim(),
        customOffice: values.customOffice.trim(),
        transitNumbering: values.transitNumbering.trim(),
        // Omitted entirely when no file was chosen, rather than sent empty.
        ...(file ? { supportingDoc: file } : {}),
      },
      {
        onSuccess: () => {
          toast.success('T1 validation created')
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
      title="New T1 validation"
      description="A transit validation raised against a nomination."
    >
      <form onSubmit={handleSubmit(onSubmit)} className="grid gap-4">
        {/* Read-only: the T1 is raised from a PFI, which already names the
            nomination. Re-picking it here could only contradict that. */}
        <div className="rounded-md border bg-muted/40 px-3 py-2">
          {chosenNomination ? (
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <div>
                <span className="text-xs text-muted-foreground">Nomination</span>
                <p className="text-sm font-medium">
                  {chosenNomination.stock?.item?.name ?? chosenNomination.destination}
                  {chosenNomination.stock?.item?.name && (
                    <span className="font-normal text-muted-foreground">
                      {' '}
                      · {chosenNomination.destination}
                    </span>
                  )}
                </p>
                <p className="text-xs text-muted-foreground">
                  {chosenNomination.driverVehicle?.driver.names ?? '—'}
                  {chosenNomination.driverVehicle?.vechile.platNumber
                    ? ` · ${chosenNomination.driverVehicle.vechile.platNumber}`
                    : ''}
                </p>
              </div>
              <div className="text-right">
                <span className="text-xs text-muted-foreground">Quantity</span>
                <p className="text-sm font-medium tabular-nums">
                  {Number(chosenNomination.quantity).toLocaleString()}
                </p>
              </div>
            </div>
          ) : (
            // The nominations list may still be loading, or the caller may not
            // be able to read it.
            <p className="text-sm text-muted-foreground">Nomination details unavailable.</p>
          )}
          {errors.nominationId && (
            <p className="mt-1 text-sm text-destructive">{errors.nominationId.message}</p>
          )}
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="exportingCountry">Exporting country</Label>
          <Input id="exportingCountry" placeholder="Rwanda" {...register('exportingCountry')} />
          {errors.exportingCountry && (
            <p className="text-sm text-destructive">{errors.exportingCountry.message}</p>
          )}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label htmlFor="customOffice">Customs office</Label>
            <Input id="customOffice" placeholder="Muhanga" {...register('customOffice')} />
            {errors.customOffice && (
              <p className="text-sm text-destructive">{errors.customOffice.message}</p>
            )}
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="transitNumbering">Transit numbering</Label>
            <Input id="transitNumbering" placeholder="758484" {...register('transitNumbering')} />
            {errors.transitNumbering && (
              <p className="text-sm text-destructive">{errors.transitNumbering.message}</p>
            )}
          </div>
        </div>

        {/* These two seed the first customs check rather than living on the
            record itself — worth saying, since the row shows them nested. */}
        <p className="-mt-1 text-xs text-muted-foreground">
          The customs office and transit number create the first validation entry, which
          can then be confirmed or cancelled.
        </p>

        <div className="grid gap-1.5">
          <Label htmlFor="supportingDoc">Supporting document</Label>
          <Input
            id="supportingDoc"
            type="file"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
          <p className="text-xs text-muted-foreground">Optional.</p>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" disabled={createValidation.isPending}>
            {createValidation.isPending ? 'Creating…' : 'Create validation'}
          </Button>
        </DialogFooter>
      </form>
    </FormDialog>
  )
}
