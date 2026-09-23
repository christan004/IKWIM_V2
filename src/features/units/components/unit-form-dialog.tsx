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
import { errorMessage, fieldErrors } from '@/lib/error-message'
import { useSaveUnit } from '@/features/units/use-units'
import type { Unit } from '@/api/types'

const schema = z.object({
  name: z.string().trim().min(1, 'Name is required'),
  code: z.string().trim().min(1, 'Code is required'),
})

type UnitForm = z.infer<typeof schema>

const emptyValues: UnitForm = { name: '', code: '' }

export function UnitFormDialog({
  open,
  onOpenChange,
  unit,
  existingUnits,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Present when editing; omitted when creating. */
  unit?: Unit | null
  /** Used to warn about duplicates, which the API does not reject. */
  existingUnits: Unit[]
}) {
  const saveUnit = useSaveUnit()
  const isEdit = Boolean(unit)

  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors },
  } = useForm<UnitForm>({ resolver: zodResolver(schema), defaultValues: emptyValues })

  // Seed from the unit being edited, and clear any previous attempt's errors.
  useEffect(() => {
    if (open) reset(unit ? { name: unit.name, code: unit.code } : emptyValues)
  }, [open, unit, reset])

  function onSubmit(values: UnitForm) {
    const name = values.name.trim()
    const code = values.code.trim()

    // The API accepts duplicate names and codes, so the check lives here —
    // otherwise a second "Kilogram (KG)" is created silently.
    const clash = existingUnits.find(
      (u) =>
        u.id !== unit?.id &&
        (u.code.toLowerCase() === code.toLowerCase() ||
          u.name.toLowerCase() === name.toLowerCase()),
    )
    if (clash) {
      const field = clash.code.toLowerCase() === code.toLowerCase() ? 'code' : 'name'
      setError(field, {
        message: `Already used by "${clash.name} (${clash.code})".`,
      })
      return
    }

    saveUnit.mutate(
      { id: unit?.id, name, code },
      {
        onSuccess: (saved) => {
          toast.success(
            isEdit
              ? `Unit "${saved?.name ?? name}" updated`
              : `Unit "${saved?.name ?? name}" created`,
          )
          onOpenChange(false)
        },
        onError: (err) => {
          const fields = fieldErrors(err)
          if (fields?.name) setError('name', { message: fields.name })
          else if (fields?.code) setError('code', { message: fields.code })
          else toast.error(errorMessage(err))
        },
      },
    )
  }

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={isEdit ? 'Edit unit' : 'New unit'}
      description="Units of measure used when recording item quantities."
    >
      <form onSubmit={handleSubmit(onSubmit)} className="grid gap-4">
        <div className="grid gap-1.5">
          <Label htmlFor="name">Name</Label>
          <Input id="name" placeholder="Kilogram" {...register('name')} />
          {errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="code">Code</Label>
          <Input id="code" placeholder="KG" className="font-mono" {...register('code')} />
          {errors.code ? (
            <p className="text-sm text-destructive">{errors.code.message}</p>
          ) : (
            <p className="text-xs text-muted-foreground">
              The short symbol shown beside quantities, e.g.{' '}
              <code className="font-mono">KG</code>.
            </p>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" disabled={saveUnit.isPending}>
            {saveUnit.isPending
              ? isEdit
                ? 'Saving…'
                : 'Creating…'
              : isEdit
                ? 'Save changes'
                : 'Create unit'}
          </Button>
        </DialogFooter>
      </form>
    </FormDialog>
  )
}
