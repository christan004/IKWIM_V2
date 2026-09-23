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
import { nominationQuantity } from '@/api/types'
import { useCurrencies, usePfi, useSavePfi } from '@/features/pfi/use-pfi'
import { useNominations } from '@/features/nominations/use-nominations'

const schema = z.object({
  nominationId: z.string().min(1, 'Choose a nomination'),
  currencyId: z.string().min(1, 'Choose a currency'),
  pfiReference: z.string().min(1, 'Reference is required'),
  // Kept as strings for the inputs, coerced on submit.
  amount: z
    .string()
    .min(1, 'Amount is required')
    .refine((v) => Number(v) > 0, 'Must be greater than 0'),
  /** Required by the API alongside `amount` — see `PfiRequest`. */
  unitPrice: z
    .string()
    .min(1, 'Unit price is required')
    .refine((v) => Number(v) > 0, 'Must be greater than 0'),
  /** Optional on the API, so blank is allowed and simply omitted. */
  rate: z.string().refine((v) => v === '' || Number(v) > 0, 'Must be greater than 0'),
})

type PfiForm = z.infer<typeof schema>

const emptyValues: PfiForm = {
  nominationId: '',
  currencyId: '',
  pfiReference: '',
  amount: '',
  unitPrice: '',
  rate: '',
}

/**
 * `currancyCode` is not a form field: it is derived from the chosen currency on
 * submit. The API stores it verbatim without checking it against `currencyId`,
 * so deriving it is the only way the two cannot disagree.
 */
const FIELD_NAMES = [
  'nominationId',
  'currencyId',
  'pfiReference',
  'amount',
  'unitPrice',
  'rate',
] as const

export function PfiFormDialog({
  open,
  onOpenChange,
  pfiId,
  nominationId: presetNominationId,
  canReadNominations,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Present when editing; the record is fetched to seed the form. */
  pfiId?: string | null
  /**
   * The nomination to invoice, when creating. PFIs are raised from the
   * Nominations page against a specific nomination, so it is **given** rather
   * than picked — there is no nomination picker here.
   */
  nominationId?: string | null
  /** Gated on `nominations.read`, not the PFI permission. */
  canReadNominations: boolean
}) {
  const savePfi = useSavePfi()
  const isEdit = Boolean(pfiId)
  // The list nests `currency` but omits `currencyId`, so editing must read the
  // detail endpoint — it is the only source of the id this form binds to.
  const { pfi, isLoading: pfiLoading } = usePfi(open ? (pfiId ?? undefined) : undefined)
  const { currencies } = useCurrencies({ enabled: open })
  const { nominations } = useNominations({ enabled: canReadNominations })

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    setError,
    watch,
    formState: { errors },
  } = useForm<PfiForm>({ resolver: zodResolver(schema), defaultValues: emptyValues })

  const nominationId = watch('nominationId')
  const currencyId = watch('currencyId')

  /** The chosen document, kept outside the form since it is not a form value. */
  const [file, setFile] = useState<File | null>(null)

  useEffect(() => {
    if (!open) return
    setFile(null)
    reset(
      pfi
        ? {
            nominationId: pfi.nominationId ?? '',
            currencyId: pfi.currencyId ?? pfi.currency?.id ?? '',
            pfiReference: pfi.pfiReference ?? '',
            amount: String(pfi.amount ?? ''),
            unitPrice: String(pfi.unitPrice ?? ''),
            rate: String(pfi.rate ?? ''),
          }
        : { ...emptyValues, nominationId: presetNominationId ?? '' },
    )
  }, [open, pfi, presetNominationId, reset])

  /** Choosing a currency prefills its default rate, which stays editable. */
  /**
   * Choosing a currency sets only the currency.
   *
   * 🔴 **Nothing is auto-filled any more.** The rate used to be prefilled from
   * the currency and the amount computed from `quantity x rate`; neither holds
   * now that `unitPrice` exists as its own required figure, and the documented
   * example pairs `RWF` with a rate of 1500 while the stored RWF rate is 1400.
   * Every figure is typed, so nothing on the invoice is a guess.
   */
  function handleCurrencyChange(value: string) {
    setValue('currencyId', value, { shouldValidate: true })
  }

  function onSubmit(values: PfiForm) {
    const currency = currencies.find((c) => c.id === values.currencyId)
    if (!currency) {
      setError('currencyId', { message: 'Choose a currency' })
      return
    }

    savePfi.mutate(
      {
        id: pfiId ?? undefined,
        nominationId: values.nominationId,
        currencyId: values.currencyId,
        // Derived, never typed — see FIELD_NAMES above. Note the API's spelling.
        currancyCode: currency.code,
        amount: Number(values.amount),
        unitPrice: Number(values.unitPrice),
        // Both optional — omitted entirely when blank rather than sent as 0
        // or an empty string.
        ...(values.rate !== '' ? { rate: Number(values.rate) } : {}),
        // The file itself, not a path — the service sends it as multipart.
        ...(file ? { supportingDoc: file } : {}),
        pfiReference: values.pfiReference.trim(),
      },
      {
        onSuccess: () => {
          toast.success(isEdit ? 'PFI updated' : 'PFI created')
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
            // The derived code has no field of its own, so its error is
            // reported against the currency picker that produced it.
            if (fields.currancyCode) {
              setError('currencyId', { message: fields.currancyCode })
              matched = true
            }
            if (matched) return
          }
          toast.error(errorMessage(err))
        },
      },
    )
  }

  const chosenCurrency = currencies.find((c) => c.id === currencyId)
  const chosenNomination = nominations.find((n) => n.id === nominationId)

  /**
   * The nomination's quantity, shown for context.
   *
   * 🔴 **The amount is no longer computed.** It used to be filled from
   * `quantity x rate`, but the API now requires a separate `unitPrice`, and the
   * three figures do not relate: a nomination of 2,499 with the documented
   * `unitPrice: 240000` / `rate: 1500` produces no matching amount by any
   * product or quotient. Rather than fill the field with arithmetic that no
   * longer holds, it is entered — a wrong figure on an invoice is worse than an
   * empty one.
   */
  const nominationQty = nominationQuantity(chosenNomination)

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={isEdit ? 'Edit PFI' : 'New PFI'}
      description="A proforma invoice raised against a nomination."
    >
      <form onSubmit={handleSubmit(onSubmit)} className="grid gap-4">
        {/* Read-only: the PFI is raised against a nomination the user has
            already chosen on the Nominations page, so re-picking it here could
            only contradict where they started. */}
        <div className="rounded-md border bg-muted/40 px-3 py-2">
          {chosenNomination ? (
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <div>
                <span className="text-xs text-muted-foreground">Nomination</span>
                <p className="text-sm font-medium">
                  {chosenNomination.stock?.item?.name ?? chosenNomination.destination}
                  {chosenNomination.stock?.item?.name && (
                    <span className="font-normal text-muted-foreground">
                      {' '}
                      · {chosenNomination.destination}
                    </span>
                  )}
                </p>
                <p className="text-xs text-muted-foreground">
                  {chosenNomination.driverVehicle?.driver.names ?? '—'}
                  {chosenNomination.driverVehicle?.vechile.platNumber
                    ? ` · ${chosenNomination.driverVehicle.vechile.platNumber}`
                    : ''}
                  {chosenNomination.stock?.cargo?.vesselName
                    ? ` · ${chosenNomination.stock.cargo.vesselName}`
                    : ''}
                </p>
              </div>
              <div className="text-right">
                <span className="text-xs text-muted-foreground">Quantity</span>
                {/* This is what the amount is calculated from, so it is the
                    figure worth showing prominently. */}
                <p className="text-sm font-medium tabular-nums">
                  {nominationQuantity(chosenNomination).toLocaleString()}
                </p>
              </div>
            </div>
          ) : (
            // The nominations list may still be loading, or the record may
            // point at one the user cannot read.
            <p className="text-sm text-muted-foreground">Nomination details unavailable.</p>
          )}
          {errors.nominationId && (
            <p className="mt-1 text-sm text-destructive">{errors.nominationId.message}</p>
          )}
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="pfiReference">Reference</Label>
          <Input id="pfiReference" placeholder="PFI-0001" {...register('pfiReference')} />
          {errors.pfiReference ? (
            <p className="text-sm text-destructive">{errors.pfiReference.message}</p>
          ) : (
            <p className="text-xs text-muted-foreground">
              Your own reference. The PFI code is generated by the server.
            </p>
          )}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label htmlFor="currencyId">Currency</Label>
            <Select value={currencyId} onValueChange={handleCurrencyChange}>
              <SelectTrigger id="currencyId">
                <SelectValue placeholder="Select a currency" />
              </SelectTrigger>
              <SelectContent>
                {currencies.map((currency) => (
                  <SelectItem key={currency.id} value={currency.id}>
                    {currency.code} — {currency.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.currencyId && (
              <p className="text-sm text-destructive">{errors.currencyId.message}</p>
            )}
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="rate">Rate</Label>
            <Input id="rate" type="number" min="0" step="any" placeholder="1500" {...register('rate')} />
            {errors.rate ? (
              <p className="text-sm text-destructive">{errors.rate.message}</p>
            ) : chosenCurrency ? (
              // Shown, not filled in: the currency's stored rate is a reference
              // point, and the documented example uses a different one.
              <p className="text-xs text-muted-foreground">
                Optional. {chosenCurrency.code} is stored at{' '}
                {Number(chosenCurrency.rate).toLocaleString()}.
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">Optional.</p>
            )}
          </div>
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="amount">
            Amount
            {chosenCurrency && (
              <span className="ml-1 font-normal text-muted-foreground">
                ({chosenCurrency.code})
              </span>
            )}
          </Label>
          <Input id="amount" type="number" min="0" step="any" placeholder="240000" {...register('amount')} />
          {errors.amount ? (
            <p className="text-sm text-destructive">{errors.amount.message}</p>
          ) : nominationQty > 0 ? (
            // Context, not arithmetic: the amount is entered, but the quantity
            // being invoiced is worth having in view while typing it.
            <p className="text-xs text-muted-foreground">
              Invoicing {nominationQty.toLocaleString()}
              {chosenCurrency ? ` at ${chosenCurrency.code}` : ''}.
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">The invoice total.</p>
          )}
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="unitPrice">Unit price</Label>
          <Input
            id="unitPrice"
            type="number"
            min="0"
            step="any"
            placeholder="240000"
            {...register('unitPrice')}
          />
          {errors.unitPrice ? (
            <p className="text-sm text-destructive">{errors.unitPrice.message}</p>
          ) : (
            <p className="text-xs text-muted-foreground">
              Price per unit. Required, and independent of the amount.
            </p>
          )}
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="supportingDoc">Supporting document</Label>
          {/* An upload, not a path: the endpoint accepts multipart, confirmed
              by posting a real file. Same treatment as cargo and central
              stock. */}
          <Input
            id="supportingDoc"
            type="file"
            onChange={(event) => setFile(event.target.files?.[0] ?? null)}
          />
          {isEdit && pfi?.supportingDocUrl && !file ? (
            <a
              href={pfi.supportingDocUrl}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1.5 text-xs text-primary underline-offset-2 hover:underline"
            >
              <FileText className="size-3.5" />
              View the current document
            </a>
          ) : (
            <p className="text-xs text-muted-foreground">
              Optional. {isEdit && 'Choosing a file replaces the existing document.'}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          {/* Saving before the record arrives would submit an empty form over
              the existing PFI. */}
          <Button type="submit" disabled={savePfi.isPending || pfiLoading}>
            {savePfi.isPending
              ? isEdit
                ? 'Saving…'
                : 'Creating…'
              : isEdit
                ? 'Save changes'
                : 'Create PFI'}
          </Button>
        </DialogFooter>
      </form>
    </FormDialog>
  )
}
