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
import { useSaveTransporter } from '@/features/transporters/use-transporters'
import type { Transporter } from '@/api/types'

const schema = z.object({
  name: z.string().trim().min(1, 'Name is required'),
  phone: z.string().trim().min(1, 'Phone is required'),
  address: z.string().trim().min(1, 'Address is required'),
  tinNumber: z.string().trim().min(1, 'TIN is required'),
})

type TransporterForm = z.infer<typeof schema>

const emptyValues: TransporterForm = { name: '', phone: '', address: '', tinNumber: '' }

const FIELD_NAMES = ['name', 'phone', 'address', 'tinNumber'] as const

export function TransporterFormDialog({
  open,
  onOpenChange,
  transporter,
  existingTransporters,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Present when editing; omitted when creating. */
  transporter?: Transporter | null
  /** Used to warn about duplicates before hitting the API. */
  existingTransporters: Transporter[]
}) {
  const saveTransporter = useSaveTransporter()
  const isEdit = Boolean(transporter)

  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors },
  } = useForm<TransporterForm>({ resolver: zodResolver(schema), defaultValues: emptyValues })

  useEffect(() => {
    if (!open) return
    reset(
      transporter
        ? {
            name: transporter.name,
            phone: transporter.phone,
            address: transporter.address,
            tinNumber: transporter.tinNumber,
          }
        : emptyValues,
    )
  }, [open, transporter, reset])

  function onSubmit(values: TransporterForm) {
    const name = values.name.trim()
    const tinNumber = values.tinNumber.trim()

    // A TIN identifies a business, so a repeat almost always means a mistake.
    const clash = existingTransporters.find(
      (t) =>
        t.id !== transporter?.id &&
        (t.tinNumber === tinNumber || t.name.toLowerCase() === name.toLowerCase()),
    )
    if (clash) {
      const field = clash.tinNumber === tinNumber ? 'tinNumber' : 'name'
      setError(field, { message: `Already used by "${clash.name}".` })
      return
    }

    saveTransporter.mutate(
      {
        id: transporter?.id,
        name,
        phone: values.phone.trim(),
        address: values.address.trim(),
        tinNumber,
      },
      {
        onSuccess: () => {
          toast.success(
            isEdit ? `Transporter "${name}" updated` : `Transporter "${name}" created`,
          )
          onOpenChange(false)
        },
        onError: (err) => {
          const fields = fieldErrors(err)
          if (fields) {
            let matched = false
            for (const field of FIELD_NAMES) {
              const message = fields[field]
              if (message) {
                setError(field, { message })
                matched = true
              }
            }
            if (matched) return
          }
          if (errorCode(err) === 'RESOURCE_CONFLICT') {
            setError('tinNumber', {
              message: 'A transporter with these details already exists.',
            })
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
      title={isEdit ? 'Edit transporter' : 'New transporter'}
      description="Haulage companies that move stock between locations."
    >
      <form onSubmit={handleSubmit(onSubmit)} className="grid gap-4">
        <div className="grid gap-1.5">
          <Label htmlFor="name">Name</Label>
          <Input id="name" placeholder="vv Ltd" {...register('name')} />
          {errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label htmlFor="phone">Phone</Label>
            <Input id="phone" inputMode="tel" placeholder="0787899594" {...register('phone')} />
            {errors.phone && <p className="text-sm text-destructive">{errors.phone.message}</p>}
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="tinNumber">TIN number</Label>
            <Input
              id="tinNumber"
              inputMode="numeric"
              placeholder="478239122"
              className="font-mono"
              {...register('tinNumber')}
            />
            {errors.tinNumber && (
              <p className="text-sm text-destructive">{errors.tinNumber.message}</p>
            )}
          </div>
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="address">Address</Label>
          <Input id="address" placeholder="Kigali, gisozi" {...register('address')} />
          {errors.address && <p className="text-sm text-destructive">{errors.address.message}</p>}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" disabled={saveTransporter.isPending}>
            {saveTransporter.isPending
              ? isEdit
                ? 'Saving…'
                : 'Creating…'
              : isEdit
                ? 'Save changes'
                : 'Create transporter'}
          </Button>
        </DialogFooter>
      </form>
    </FormDialog>
  )
}
