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
import { useSaveCurrency } from '@/features/pfi/use-pfi'
import type { Currency } from '@/api/types'

const schema = z.object({
  code: z.string().min(1, 'Code is required'),
  name: z.string().min(1, 'Name is required'),
  // Kept as a string for the input, coerced on submit.
  rate: z
    .string()
    .min(1, 'Rate is required')
    .refine((v) => Number(v) > 0, 'Must be greater than 0'),
})

type CurrencyForm = z.infer<typeof schema>

const emptyValues: CurrencyForm = { code: '', name: '', rate: '' }

const FIELD_NAMES = ['code', 'name', 'rate'] as const

export function CurrencyFormDialog({
  open,
  onOpenChange,
  currency,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Present when editing. The list carries every field, so no fetch is needed. */
  currency?: Currency | null
}) {
  const saveCurrency = useSaveCurrency()
  const isEdit = Boolean(currency)

  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors },
  } = useForm<CurrencyForm>({ resolver: zodResolver(schema), defaultValues: emptyValues })

  useEffect(() => {
    if (!open) return
    reset(
      currency
        ? { code: currency.code, name: currency.name, rate: String(currency.rate ?? '') }
        : emptyValues,
    )
  }, [open, currency, reset])

  function onSubmit(values: CurrencyForm) {
    saveCurrency.mutate(
      {
        id: currency?.id,
        code: values.code.trim().toUpperCase(),
        name: values.name.trim(),
        rate: Number(values.rate),
      },
      {
        onSuccess: () => {
          toast.success(isEdit ? 'Currency updated' : 'Currency created')
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
      title={isEdit ? 'Edit currency' : 'New currency'}
      description="Currencies a PFI can be denominated in."
    >
      <form onSubmit={handleSubmit(onSubmit)} className="grid gap-4">
        <div className="grid gap-4 sm:grid-cols-[1fr_2fr]">
          <div className="grid gap-1.5">
            <Label htmlFor="code">Code</Label>
            {/* Uppercased on submit, since the code is shown on every PFI row. */}
            <Input id="code" placeholder="RWF" className="uppercase" {...register('code')} />
            {errors.code && <p className="text-sm text-destructive">{errors.code.message}</p>}
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="name">Name</Label>
            <Input id="name" placeholder="Rwandan Francs" {...register('name')} />
            {errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
          </div>
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="rate">Rate</Label>
          <Input id="rate" type="number" min="0" step="any" placeholder="1400" {...register('rate')} />
          {errors.rate ? (
            <p className="text-sm text-destructive">{errors.rate.message}</p>
          ) : (
            <p className="text-xs text-muted-foreground">
              The currency's default rate. A PFI records its own rate separately.
            </p>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" disabled={saveCurrency.isPending}>
            {saveCurrency.isPending
              ? isEdit
                ? 'Saving…'
                : 'Creating…'
              : isEdit
                ? 'Save changes'
                : 'Create currency'}
          </Button>
        </DialogFooter>
      </form>
    </FormDialog>
  )
}
