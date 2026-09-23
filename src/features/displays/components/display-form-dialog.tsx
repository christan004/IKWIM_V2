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
import { useDisplay, useSaveDisplay } from '@/features/displays/use-displays'
import { usePumps } from '@/features/pumps/use-pumps'

const schema = z.object({
  name: z.string().min(1, 'Name is required'),
  code: z.string().min(1, 'Code is required'),
  pumpId: z.string().min(1, 'Choose a pump'),
})

type DisplayForm = z.infer<typeof schema>

const emptyValues: DisplayForm = { name: '', code: '', pumpId: '' }

const FIELD_NAMES = ['name', 'code', 'pumpId'] as const

export function DisplayFormDialog({
  open,
  onOpenChange,
  displayId,
  canReadPumps,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Present when editing; the record is fetched to seed the form. */
  displayId?: string | null
  /** Gated on `pump.read`, not the display permission. */
  canReadPumps: boolean
}) {
  const saveDisplay = useSaveDisplay()
  const isEdit = Boolean(displayId)
  // The list omits `pumpId`, so editing *must* read the detail endpoint — it is
  // the only source of the id this form binds to.
  const { display, isLoading: displayLoading } = useDisplay(
    open ? (displayId ?? undefined) : undefined,
  )
  const { pumps } = usePumps({ enabled: canReadPumps })

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    setError,
    watch,
    formState: { errors },
  } = useForm<DisplayForm>({ resolver: zodResolver(schema), defaultValues: emptyValues })

  const pumpId = watch('pumpId')

  useEffect(() => {
    if (!open) return
    reset(
      display
        ? {
            name: display.name ?? '',
            code: display.code ?? '',
            pumpId: display.pumpId ?? display.pump?.id ?? '',
          }
        : emptyValues,
    )
  }, [open, display, reset])

  function onSubmit(values: DisplayForm) {
    saveDisplay.mutate(
      {
        id: displayId ?? undefined,
        name: values.name.trim(),
        code: values.code.trim(),
        pumpId: values.pumpId,
      },
      {
        onSuccess: () => {
          toast.success(isEdit ? 'Display updated' : 'Display created')
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
      title={isEdit ? 'Edit display' : 'New display'}
      description="A display attached to a pump."
    >
      <form onSubmit={handleSubmit(onSubmit)} className="grid gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label htmlFor="name">Name</Label>
            <Input id="name" placeholder="First Display" {...register('name')} />
            {errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="code">Code</Label>
            <Input id="code" placeholder="DSCOSDE222" {...register('code')} />
            {errors.code && <p className="text-sm text-destructive">{errors.code.message}</p>}
          </div>
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="pumpId">Pump</Label>
          <Select
            value={pumpId}
            onValueChange={(v) => setValue('pumpId', v, { shouldValidate: true })}
          >
            <SelectTrigger id="pumpId">
              <SelectValue placeholder="Select a pump" />
            </SelectTrigger>
            <SelectContent>
              {pumps.map((pump) => (
                <SelectItem key={pump.id} value={pump.id}>
                  {pump.name}
                  {/* Pump names repeat across sites, so the site is what tells
                      two of them apart. */}
                  {pump.site?.name ? ` — ${pump.site.name}` : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {errors.pumpId ? (
            <p className="text-sm text-destructive">{errors.pumpId.message}</p>
          ) : (
            pumps.length === 0 && (
              <p className="text-xs text-muted-foreground">No pumps available yet.</p>
            )
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          {/* Saving before the record arrives would submit an empty form over
              the existing display. */}
          <Button type="submit" disabled={saveDisplay.isPending || displayLoading}>
            {saveDisplay.isPending
              ? isEdit
                ? 'Saving…'
                : 'Creating…'
              : isEdit
                ? 'Save changes'
                : 'Create display'}
          </Button>
        </DialogFooter>
      </form>
    </FormDialog>
  )
}
