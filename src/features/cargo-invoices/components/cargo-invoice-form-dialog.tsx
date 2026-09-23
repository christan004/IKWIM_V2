import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { FileText } from 'lucide-react'
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
import { useCurrencies } from '@/features/pfi/use-pfi'
import { useSaveCargoInvoice } from '@/features/cargo-invoices/use-cargo-invoices'
import { documentHref } from '@/features/cargo-invoices/document-href'
import type { CargoInvoice } from '@/api/types'

const positive = (label: string) =>
  z
    .string()
    .min(1, `${label} is required`)
    .refine((v) => Number(v) > 0, 'Must be greater than 0')

const schema = z.object({
  // Kept as strings for the inputs, coerced on submit.
  quantity: positive('Quantity'),
  unitPrice: positive('Unit price'),
  amount: positive('Amount'),
  currencyCode: z.string().min(1, 'Choose a currency'),
  invoiceCode: z.string().min(1, 'Invoice code is required'),
  invoiceReference: z.string().min(1, 'Reference is required'),
})

type CargoInvoiceForm = z.infer<typeof schema>

const emptyValues: CargoInvoiceForm = {
  quantity: '',
  unitPrice: '',
  amount: '',
  currencyCode: '',
  invoiceCode: '',
  invoiceReference: '',
}

const FIELD_NAMES = [
  'quantity',
  'unitPrice',
  'amount',
  'currencyCode',
  'invoiceCode',
  'invoiceReference',
] as const

export function CargoInvoiceFormDialog({
  open,
  onOpenChange,
  cargoId,
  cargoLabel,
  invoice,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** The shipment being invoiced. Given by the page, never picked here. */
  cargoId: string
  /** Vessel and BL, shown so the shipment being invoiced is unambiguous. */
  cargoLabel: string
  /**
   * Present when editing. There is no detail endpoint for a single invoice, so
   * the row itself seeds the form — it already carries every field.
   */
  invoice?: CargoInvoice | null
}) {
  const saveInvoice = useSaveCargoInvoice()
  const isEdit = Boolean(invoice)
  const { currencies } = useCurrencies({ enabled: open })

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    setError,
    watch,
    formState: { errors },
  } = useForm<CargoInvoiceForm>({
    resolver: zodResolver(schema),
    defaultValues: emptyValues,
  })

  const currencyCode = watch('currencyCode')
  const quantity = watch('quantity')
  const unitPrice = watch('unitPrice')

  /** The chosen document, kept outside the form since it is not a form value. */
  const [file, setFile] = useState<File | null>(null)

  useEffect(() => {
    if (!open) return
    setFile(null)
    reset(
      invoice
        ? {
            quantity: String(invoice.quantity ?? ''),
            unitPrice: String(invoice.unitPrice ?? ''),
            amount: String(invoice.amount ?? ''),
            currencyCode: invoice.currencyCode ?? '',
            invoiceCode: invoice.invoiceCode ?? '',
            invoiceReference: invoice.invoiceReference ?? '',
          }
        : emptyValues,
    )
  }, [open, invoice, reset])

  /**
   * Quantity × unit price, or null when either is missing or not a number.
   *
   * The API does **not** check `amount` against this, so it is offered rather
   * than enforced — the figure stays typed by hand and only differs when the
   * user means it to.
   */
  const computed =
    Number(quantity) > 0 && Number(unitPrice) > 0
      ? Number(quantity) * Number(unitPrice)
      : null

  function onSubmit(values: CargoInvoiceForm) {
    saveInvoice.mutate(
      {
        id: invoice?.id,
        cargoId,
        quantity: Number(values.quantity),
        unitPrice: Number(values.unitPrice),
        amount: Number(values.amount),
        currencyCode: values.currencyCode,
        invoiceCode: values.invoiceCode.trim(),
        invoiceReference: values.invoiceReference.trim(),
        // The file itself, not a path — the service sends it as multipart.
        // Omitted entirely when nothing was chosen.
        ...(file ? { supportingDoc: file } : {}),
      },
      {
        onSuccess: () => {
          toast.success(isEdit ? 'Invoice updated' : 'Invoice created')
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
            /*
             * 🔴 `cargoId` has no field of its own — the shipment is given by
             * the page, not chosen here. It is also the field the server
             * currently rejects for every real cargo (a cuid failing a UUID
             * check), so its error is surfaced plainly rather than swallowed.
             */
            if (fields.cargoId) {
              toast.error(`Shipment rejected by the server: ${fields.cargoId}`)
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
      title={isEdit ? 'Edit invoice' : 'New cargo invoice'}
      description={cargoLabel}
    >
      <form onSubmit={handleSubmit(onSubmit)} className="grid gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="invoiceCode">Invoice code</Label>
            <Input id="invoiceCode" {...register('invoiceCode')} />
            {errors.invoiceCode && (
              <p className="mt-1 text-sm text-destructive">{errors.invoiceCode.message}</p>
            )}
          </div>

          <div>
            <Label htmlFor="invoiceReference">Reference</Label>
            <Input id="invoiceReference" {...register('invoiceReference')} />
            {errors.invoiceReference && (
              <p className="mt-1 text-sm text-destructive">
                {errors.invoiceReference.message}
              </p>
            )}
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="quantity">Quantity</Label>
            <Input id="quantity" type="number" step="any" {...register('quantity')} />
            {errors.quantity && (
              <p className="mt-1 text-sm text-destructive">{errors.quantity.message}</p>
            )}
          </div>

          <div>
            <Label htmlFor="unitPrice">Unit price</Label>
            <Input id="unitPrice" type="number" step="any" {...register('unitPrice')} />
            {errors.unitPrice && (
              <p className="mt-1 text-sm text-destructive">{errors.unitPrice.message}</p>
            )}
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="amount">Amount</Label>
            <Input id="amount" type="number" step="any" {...register('amount')} />
            {errors.amount ? (
              <p className="mt-1 text-sm text-destructive">{errors.amount.message}</p>
            ) : (
              computed !== null && (
                <p className="mt-1 text-xs text-muted-foreground">
                  Quantity × unit price is {computed.toLocaleString()}.{' '}
                  <button
                    type="button"
                    className="text-primary underline-offset-2 hover:underline"
                    onClick={() =>
                      setValue('amount', String(computed), { shouldValidate: true })
                    }
                  >
                    Use it
                  </button>
                </p>
              )
            )}
          </div>

          <div>
            <Label htmlFor="currencyCode">Currency</Label>
            <Select
              value={currencyCode}
              onValueChange={(value) =>
                setValue('currencyCode', value, { shouldValidate: true })
              }
            >
              <SelectTrigger id="currencyCode" className="w-full">
                <SelectValue placeholder="Choose a currency" />
              </SelectTrigger>
              <SelectContent>
                {currencies.map((currency) => (
                  // The API stores the **code**, not the id — and does not check
                  // it against this list, so the choice is restricted here.
                  <SelectItem key={currency.id} value={currency.code}>
                    {currency.code}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.currencyCode && (
              <p className="mt-1 text-sm text-destructive">{errors.currencyCode.message}</p>
            )}
          </div>
        </div>

        <div>
          <Label htmlFor="supportingDoc">Supporting document</Label>
          <Input
            id="supportingDoc"
            type="file"
            onChange={(event) => setFile(event.target.files?.[0] ?? null)}
          />
          {isEdit && documentHref(invoice?.supportingDocUrl) && !file ? (
            <a
              href={documentHref(invoice?.supportingDocUrl) ?? undefined}
              target="_blank"
              rel="noreferrer"
              className="mt-1 flex items-center gap-1.5 text-xs text-primary underline-offset-2 hover:underline"
            >
              <FileText className="size-3.5" />
              View the current document
            </a>
          ) : (
            <p className="mt-1 text-xs text-muted-foreground">
              Optional. {isEdit && 'Choosing a file replaces the existing document.'}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" disabled={saveInvoice.isPending}>
            {saveInvoice.isPending ? 'Saving…' : isEdit ? 'Save changes' : 'Create invoice'}
          </Button>
        </DialogFooter>
      </form>
    </FormDialog>
  )
}
