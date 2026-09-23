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
import { useSaveToleranceRate } from '@/features/items/use-tolerance-rates'
import type { ItemToleranceRate } from '@/api/types'

const schema = z.object({
  // Kept as a string for the input, coerced on submit. The API bounds it at
  // `>= 0` with no upper limit, so only the lower bound is enforced here.
  maxRate: z
    .string()
    .min(1, 'Maximum rate is required')
    .refine((v) => Number.isFinite(Number(v)), 'Must be a number')
    .refine((v) => Number(v) >= 0, 'Cannot be negative'),
})

type ToleranceRateForm = z.infer<typeof schema>

const FIELD_NAMES = ['maxRate'] as const

/**
 * Sets one item's tolerance rate.
 *
 * The item is given by the row the action came from, never picked here — so
 * `itemId` is a prop rather than a field, and the rate cannot be attached to
 * the wrong item.
 */
export function ToleranceRateDialog({
  open,
  onOpenChange,
  itemId,
  itemName,
  rate,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  itemId: string
  itemName: string
  /**
   * The item's existing rate, when it has one. Present means edit — there is no
   * delete endpoint, so changing the figure is the only correction path.
   */
  rate?: ItemToleranceRate | null
}) {
  const saveRate = useSaveToleranceRate()
  const isEdit = Boolean(rate)

  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors },
  } = useForm<ToleranceRateForm>({
    resolver: zodResolver(schema),
    defaultValues: { maxRate: '' },
  })

  useEffect(() => {
    if (!open) return
    reset({ maxRate: rate ? String(rate.maxRate ?? '') : '' })
  }, [open, rate, reset])

  function onSubmit(values: ToleranceRateForm) {
    saveRate.mutate(
      {
        id: rate?.id,
        itemId,
        // A number, not the string the documented body shows.
        maxRate: Number(values.maxRate),
      },
      {
        onSuccess: () => {
          toast.success(isEdit ? 'Tolerance rate updated' : 'Tolerance rate set')
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
            // `itemId` has no field of its own — the item comes from the row —
            // so its error is surfaced rather than silently dropped.
            if (fields.itemId) {
              toast.error(`Item rejected by the server: ${fields.itemId}`)
              return
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
      title={isEdit ? 'Edit tolerance rate' : 'Set tolerance rate'}
      description={itemName}
    >
      <form onSubmit={handleSubmit(onSubmit)} className="grid gap-4">
        <div className="grid gap-1.5">
          <Label htmlFor="maxRate">Maximum rate</Label>
          <Input
            id="maxRate"
            type="number"
            min="0"
            step="any"
            placeholder="1"
            {...register('maxRate')}
          />
          {errors.maxRate ? (
            <p className="text-sm text-destructive">{errors.maxRate.message}</p>
          ) : (
            <p className="text-xs text-muted-foreground">
              The allowance within which a discrepancy on this item is not treated as a
              loss. Must be zero or greater.
            </p>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" disabled={saveRate.isPending}>
            {saveRate.isPending ? 'Saving…' : isEdit ? 'Save changes' : 'Set rate'}
          </Button>
        </DialogFooter>
      </form>
    </FormDialog>
  )
}
