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
import { errorCode, errorMessage, fieldErrors } from '@/lib/error-message'
import { useSaveSupplierType } from '@/features/suppliers/use-supplier-types'
import type { SupplierType } from '@/api/types'

const schema = z.object({
  type: z.string().trim().min(1, 'Type is required'),
})

type SupplierTypeForm = z.infer<typeof schema>

export function SupplierTypeFormDialog({
  open,
  onOpenChange,
  supplierType,
  existingTypes,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Present when editing; omitted when creating. */
  supplierType?: SupplierType | null
  /** Used to warn about duplicates before hitting the API. */
  existingTypes: SupplierType[]
}) {
  const saveType = useSaveSupplierType()
  const isEdit = Boolean(supplierType)

  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors },
  } = useForm<SupplierTypeForm>({ resolver: zodResolver(schema), defaultValues: { type: '' } })

  useEffect(() => {
    if (open) reset({ type: supplierType?.type ?? '' })
  }, [open, supplierType, reset])

  function onSubmit(values: SupplierTypeForm) {
    // Existing values are uppercase (FOREIGN, LOCAL); keep that consistent
    // rather than let "Foreign" and "FOREIGN" coexist.
    const type = values.type.trim().toUpperCase()

    const clash = existingTypes.find(
      (t) => t.id !== supplierType?.id && t.type.toUpperCase() === type,
    )
    if (clash) {
      setError('type', { message: `"${clash.type}" already exists.` })
      return
    }

    saveType.mutate(
      { id: supplierType?.id, type },
      {
        onSuccess: () => {
          toast.success(
            isEdit ? `Supplier type "${type}" updated` : `Supplier type "${type}" created`,
          )
          onOpenChange(false)
        },
        onError: (err) => {
          const message = fieldErrors(err)?.type
          if (message) {
            setError('type', { message })
            return
          }
          if (errorCode(err) === 'RESOURCE_CONFLICT') {
            setError('type', { message: 'A supplier type with this name already exists.' })
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
      title={isEdit ? 'Edit supplier type' : 'New supplier type'}
      description="How suppliers are classified, for example FOREIGN or LOCAL."
    >
      <form onSubmit={handleSubmit(onSubmit)} className="grid gap-4">
        <div className="grid gap-1.5">
          <Label htmlFor="type">Type</Label>
          <Input
            id="type"
            placeholder="FOREIGN"
            className="font-mono uppercase"
            {...register('type')}
          />
          {errors.type ? (
            <p className="text-sm text-destructive">{errors.type.message}</p>
          ) : (
            <p className="text-xs text-muted-foreground">
              Saved in uppercase to match the existing values.
            </p>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" disabled={saveType.isPending}>
            {saveType.isPending
              ? isEdit
                ? 'Saving…'
                : 'Creating…'
              : isEdit
                ? 'Save changes'
                : 'Create type'}
          </Button>
        </DialogFooter>
      </form>
    </FormDialog>
  )
}
