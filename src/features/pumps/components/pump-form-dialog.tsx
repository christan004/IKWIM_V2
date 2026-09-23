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
import { usePump, useSavePump } from '@/features/pumps/use-pumps'
import { useSites } from '@/features/pss/use-pss'

const schema = z.object({
  name: z.string().min(1, 'Name is required'),
  siteId: z.string().min(1, 'Choose a site'),
})

type PumpForm = z.infer<typeof schema>

const emptyValues: PumpForm = { name: '', siteId: '' }

const FIELD_NAMES = ['name', 'siteId'] as const

export function PumpFormDialog({
  open,
  onOpenChange,
  pumpId,
  canReadSites,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Present when editing; the record is fetched to seed the form. */
  pumpId?: string | null
  /** Gated on `pss.read`, not the pump permission. */
  canReadSites: boolean
}) {
  const savePump = useSavePump()
  const isEdit = Boolean(pumpId)
  // The list omits `siteId` entirely, so editing *must* read the detail
  // endpoint — it is the only source of the id this form binds to.
  const { pump, isLoading: pumpLoading } = usePump(open ? (pumpId ?? undefined) : undefined)
  const { sites } = useSites({ enabled: canReadSites })

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    setError,
    watch,
    formState: { errors },
  } = useForm<PumpForm>({ resolver: zodResolver(schema), defaultValues: emptyValues })

  const siteId = watch('siteId')

  /**
   * An inactive site stays selectable on the pump that already uses it, and the
   * current value is always included — Radix falls back to the placeholder if a
   * Select's value has no mounted option, even for one render.
   */
  const selectableSites = sites.filter(
    (s) => s.status === 'active' || s.id === pump?.siteId || s.id === siteId,
  )

  useEffect(() => {
    if (!open) return
    reset(
      pump
        ? { name: pump.name ?? '', siteId: pump.siteId ?? pump.site?.id ?? '' }
        : emptyValues,
    )
  }, [open, pump, reset])

  function onSubmit(values: PumpForm) {
    savePump.mutate(
      { id: pumpId ?? undefined, name: values.name.trim(), siteId: values.siteId },
      {
        onSuccess: () => {
          toast.success(isEdit ? 'Pump updated' : 'Pump created')
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
      title={isEdit ? 'Edit pump' : 'New pump'}
      description="A pump belonging to a site."
    >
      <form onSubmit={handleSubmit(onSubmit)} className="grid gap-4">
        <div className="grid gap-1.5">
          <Label htmlFor="name">Name</Label>
          <Input id="name" placeholder="Pump 1" {...register('name')} />
          {errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="siteId">Site</Label>
          <Select
            value={siteId}
            onValueChange={(v) => setValue('siteId', v, { shouldValidate: true })}
          >
            <SelectTrigger id="siteId">
              <SelectValue placeholder="Select a site" />
            </SelectTrigger>
            <SelectContent>
              {selectableSites.map((site) => (
                <SelectItem key={site.id} value={site.id}>
                  {site.name}
                  {site.address ? ` — ${site.address}` : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {errors.siteId ? (
            <p className="text-sm text-destructive">{errors.siteId.message}</p>
          ) : (
            sites.length === 0 && (
              <p className="text-xs text-muted-foreground">No sites available yet.</p>
            )
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          {/* Saving before the record arrives would submit an empty form over
              the existing pump. */}
          <Button type="submit" disabled={savePump.isPending || pumpLoading}>
            {savePump.isPending
              ? isEdit
                ? 'Saving…'
                : 'Creating…'
              : isEdit
                ? 'Save changes'
                : 'Create pump'}
          </Button>
        </DialogFooter>
      </form>
    </FormDialog>
  )
}
