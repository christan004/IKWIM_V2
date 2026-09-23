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
import { useSaveOrderPlan } from '@/features/orders/use-order-plans'
import type { OrderPlan } from '@/api/types'

const schema = z
  .object({
    name: z.string().trim().min(1, 'Name is required'),
    startDate: z.string().min(1, 'Start date is required'),
    endDate: z.string().min(1, 'End date is required'),
  })
  .refine((v) => !v.startDate || !v.endDate || v.endDate >= v.startDate, {
    path: ['endDate'],
    message: 'Must be on or after the start date',
  })

type OrderPlanForm = z.infer<typeof schema>

const emptyValues: OrderPlanForm = { name: '', startDate: '', endDate: '' }

/** `<input type="date">` gives `YYYY-MM-DD`; the API wants a full ISO instant. */
function toIso(date: string): string {
  return new Date(`${date}T00:00:00Z`).toISOString()
}

/**
 * ISO instant back to the `YYYY-MM-DD` the date input needs. Sliced rather than
 * read through `Date` getters, which would shift the day in timezones behind
 * UTC — a plan starting `2026-08-11T00:00:00Z` must not display as the 10th.
 */
function toDateInput(iso: string | undefined): string {
  return iso ? iso.slice(0, 10) : ''
}

export function OrderPlanFormDialog({
  open,
  onOpenChange,
  plan,
  existingPlans,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Present when editing; omitted when creating. */
  plan?: OrderPlan | null
  /** Used to warn about duplicate names before hitting the API. */
  existingPlans: OrderPlan[]
}) {
  const savePlan = useSaveOrderPlan()
  const isEdit = Boolean(plan)

  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors },
  } = useForm<OrderPlanForm>({ resolver: zodResolver(schema), defaultValues: emptyValues })

  useEffect(() => {
    if (!open) return
    reset(
      plan
        ? {
            name: plan.name,
            startDate: toDateInput(plan.startDate),
            endDate: toDateInput(plan.endDate),
          }
        : emptyValues,
    )
  }, [open, plan, reset])

  function onSubmit(values: OrderPlanForm) {
    const name = values.name.trim()

    const clash = existingPlans.find(
      (p) => p.id !== plan?.id && p.name.toLowerCase() === name.toLowerCase(),
    )
    if (clash) {
      setError('name', { message: `"${clash.name}" already exists.` })
      return
    }

    savePlan.mutate(
      {
        id: plan?.id,
        name,
        startDate: toIso(values.startDate),
        endDate: toIso(values.endDate),
      },
      {
        onSuccess: () => {
          toast.success(isEdit ? `Plan "${name}" updated` : `Plan "${name}" created`)
          onOpenChange(false)
        },
        onError: (err) => {
          const fields = fieldErrors(err)
          if (fields?.name) setError('name', { message: fields.name })
          else if (fields?.startDate) setError('startDate', { message: fields.startDate })
          else if (fields?.endDate) setError('endDate', { message: fields.endDate })
          else if (errorCode(err) === 'RESOURCE_CONFLICT') {
            setError('name', { message: 'A plan with this name already exists.' })
          } else toast.error(errorMessage(err))
        },
      },
    )
  }

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={isEdit ? 'Edit order plan' : 'New order plan'}
      description="A named period that orders are grouped into."
    >
      <form onSubmit={handleSubmit(onSubmit)} className="grid gap-4">
        <div className="grid gap-1.5">
          <Label htmlFor="name">Name</Label>
          <Input id="name" placeholder="First Month Plan" {...register('name')} />
          {errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label htmlFor="startDate">Start date</Label>
            <Input id="startDate" type="date" {...register('startDate')} />
            {errors.startDate && (
              <p className="text-sm text-destructive">{errors.startDate.message}</p>
            )}
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="endDate">End date</Label>
            <Input id="endDate" type="date" {...register('endDate')} />
            {errors.endDate && (
              <p className="text-sm text-destructive">{errors.endDate.message}</p>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" disabled={savePlan.isPending}>
            {savePlan.isPending
              ? isEdit
                ? 'Saving…'
                : 'Creating…'
              : isEdit
                ? 'Save changes'
                : 'Create plan'}
          </Button>
        </DialogFooter>
      </form>
    </FormDialog>
  )
}
