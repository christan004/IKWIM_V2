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
import { errorCode, errorMessage, fieldErrors } from '@/lib/error-message'
import { useSaveSupplier } from '@/features/suppliers/use-suppliers'
import { useSupplierTypes } from '@/features/suppliers/use-supplier-types'
import type { Supplier } from '@/api/types'

const schema = z.object({
  name: z.string().trim().min(1, 'Name is required'),
  phone: z.string().trim().min(1, 'Phone is required'),
  address: z.string().trim().min(1, 'Address is required'),
  tinNumber: z.string().trim().min(1, 'TIN is required'),
  supplierTypeId: z.string().min(1, 'Choose a supplier type'),
})

type SupplierForm = z.infer<typeof schema>

const emptyValues: SupplierForm = {
  name: '',
  phone: '',
  address: '',
  tinNumber: '',
  supplierTypeId: '',
}

/** Field names the API may return errors against, mapped onto the form. */
const FIELD_NAMES = ['name', 'phone', 'address', 'tinNumber', 'supplierTypeId'] as const

export function SupplierFormDialog({
  open,
  onOpenChange,
  supplier,
  existingSuppliers,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Present when editing; omitted when creating. */
  supplier?: Supplier | null
  /** Used to warn about duplicates before hitting the API. */
  existingSuppliers: Supplier[]
}) {
  const saveSupplier = useSaveSupplier()
  const { types, isLoading: typesLoading } = useSupplierTypes()
  const isEdit = Boolean(supplier)

  // An inactive type stays on the supplier that already uses it, but must not
  // be selectable for a new one.
  const selectableTypes = types.filter(
    (t) => t.status === 'active' || t.id === supplier?.supplierType?.id,
  )

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    setError,
    watch,
    formState: { errors },
  } = useForm<SupplierForm>({ resolver: zodResolver(schema), defaultValues: emptyValues })

  useEffect(() => {
    if (!open) return
    reset(
      supplier
        ? {
            name: supplier.name,
            phone: supplier.phone,
            address: supplier.address,
            tinNumber: supplier.tinNumber,
            // The list nests the type as an object; the id lives inside it.
            supplierTypeId: supplier.supplierType?.id ?? '',
          }
        : emptyValues,
    )
  }, [open, supplier, reset])

  const supplierTypeId = watch('supplierTypeId')

  function onSubmit(values: SupplierForm) {
    const name = values.name.trim()
    const tinNumber = values.tinNumber.trim()

    // A TIN identifies a business, so a repeat almost always means a mistake.
    const clash = existingSuppliers.find(
      (s) =>
        s.id !== supplier?.id &&
        (s.tinNumber === tinNumber || s.name.toLowerCase() === name.toLowerCase()),
    )
    if (clash) {
      const field = clash.tinNumber === tinNumber ? 'tinNumber' : 'name'
      setError(field, { message: `Already used by "${clash.name}".` })
      return
    }

    saveSupplier.mutate(
      {
        id: supplier?.id,
        name,
        phone: values.phone.trim(),
        address: values.address.trim(),
        tinNumber,
        supplierTypeId: values.supplierTypeId,
      },
      {
        onSuccess: () => {
          toast.success(isEdit ? `Supplier "${name}" updated` : `Supplier "${name}" created`)
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
            setError('tinNumber', { message: 'A supplier with these details already exists.' })
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
      title={isEdit ? 'Edit supplier' : 'New supplier'}
      description="Businesses you buy fuel and materials from."
    >
      <form onSubmit={handleSubmit(onSubmit)} className="grid gap-4">
        <div className="grid gap-1.5">
          <Label htmlFor="name">Name</Label>
          <Input id="name" placeholder="MOGAS OIL" {...register('name')} />
          {errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label htmlFor="phone">Phone</Label>
            <Input id="phone" inputMode="tel" placeholder="0787899696" {...register('phone')} />
            {errors.phone && <p className="text-sm text-destructive">{errors.phone.message}</p>}
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="tinNumber">TIN number</Label>
            <Input
              id="tinNumber"
              inputMode="numeric"
              placeholder="909090904"
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
          <Input id="address" placeholder="Kigali Nyarugenge" {...register('address')} />
          {errors.address && <p className="text-sm text-destructive">{errors.address.message}</p>}
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="supplierTypeId">Supplier type</Label>
          <Select
            value={supplierTypeId}
            onValueChange={(v) => setValue('supplierTypeId', v, { shouldValidate: true })}
          >
            <SelectTrigger id="supplierTypeId">
              <SelectValue placeholder={typesLoading ? 'Loading types…' : 'Select a type'} />
            </SelectTrigger>
            <SelectContent>
              {selectableTypes.map((type) => (
                <SelectItem key={type.id} value={type.id}>
                  {type.type}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {errors.supplierTypeId && (
            <p className="text-sm text-destructive">{errors.supplierTypeId.message}</p>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" disabled={saveSupplier.isPending}>
            {saveSupplier.isPending
              ? isEdit
                ? 'Saving…'
                : 'Creating…'
              : isEdit
                ? 'Save changes'
                : 'Create supplier'}
          </Button>
        </DialogFooter>
      </form>
    </FormDialog>
  )
}
