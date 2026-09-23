import { useEffect, useState } from 'react'
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
import { nominationQuantity } from '@/api/types'
import { useCreateCentralStock } from '@/features/central-stock/use-central-stock'
import { useConfirmedT1Validations } from '@/features/t1-validation/use-t1-validation'
import { useItems } from '@/features/items/use-items'
import { useUnits } from '@/features/units/use-units'
import { useDeports } from '@/features/deports/use-deports'
import { useToleranceRates } from '@/features/items/use-tolerance-rates'

/** Optional and numeric: blank is allowed, anything non-numeric is not. */
const optionalNumber = z
  .string()
  .refine((v) => v === '' || Number.isFinite(Number(v)), 'Must be a number')

const schema = z.object({
  t1ValidationId: z.string().min(1, 'Choose a T1 validation'),
  deportId: z.string().min(1, 'Choose a deport'),
  // Both required, and both kept as strings for the inputs, coerced on submit.
  ambQuantity: z
    .string()
    .min(1, 'Ambient quantity is required')
    .refine((v) => Number(v) > 0, 'Must be greater than 0'),
  quantityAt20C: z
    .string()
    .min(1, 'Quantity at 20 °C is required')
    .refine((v) => Number(v) > 0, 'Must be greater than 0'),
  /*
   * Optional reconciliation figures. The API validates only that they parse as
   * numbers — it accepts negatives — so a loss or gain is held to being
   * non-negative here, since the sign is carried by which field it goes in.
   */
  toleranceRate: optionalNumber,
  /*
   * `lossQty` is **not** a field: it is the T1's quantity minus what was
   * received at 20 °C, so asking for it would invite a figure that contradicts
   * the two quantities above. It is computed on submit instead.
   */
  gainQty: optionalNumber.refine((v) => v === '' || Number(v) >= 0, 'Cannot be negative'),
  // Optional references, free text server-side.
  customOffice: z.string(),
  transitNumbering: z.string(),
  blRef: z.string(),
})

type CentralStockForm = z.infer<typeof schema>

const emptyValues: CentralStockForm = {
  t1ValidationId: '',
  deportId: '',
  ambQuantity: '',
  quantityAt20C: '',
  toleranceRate: '',
  gainQty: '',
  customOffice: '',
  transitNumbering: '',
  blRef: '',
}

/**
 * `itemId` is not a form field: the T1 validation already identifies the item,
 * via `nomination.stock.item`. It is still **required by the API**, so it is
 * derived on submit rather than asked for — the same treatment `currancyCode`
 * gets on PFI, and for the same reason: two inputs that must agree cannot
 * disagree if only one of them is entered.
 */
const FIELD_NAMES = [
  't1ValidationId',
  'deportId',
  'ambQuantity',
  'quantityAt20C',
  'toleranceRate',
  'gainQty',
  'customOffice',
  'transitNumbering',
  'blRef',
] as const

/**
 * Create only — the API exposes no update, delete or status endpoint for
 * central stock, so there is nothing to edit into.
 */
export function CentralStockFormDialog({
  open,
  onOpenChange,
  canReadT1,
  canReadItems,
  canReadUnits,
  canReadDeports,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Gated on `t1.validation.read`, not the central-stock permission. */
  canReadT1: boolean
  /** Gated on `items.read` — only used to name the item's parent. */
  canReadItems: boolean
  /** Gated on `units.read` — only used to name the item's unit. */
  canReadUnits: boolean
  /** Gated on `deports.read`. */
  canReadDeports: boolean
}) {
  const createCentralStock = useCreateCentralStock()
  // Only **confirmed** validations: stock should not be received against
  // transit whose customs checks have not cleared.
  const { validations } = useConfirmedT1Validations({ enabled: canReadT1 })
  const { rows: itemRows } = useItems({ enabled: canReadItems })
  const { units } = useUnits({ enabled: canReadUnits })
  const { deports } = useDeports({ enabled: canReadDeports })
  // Tolerance rates have no permissions of their own — `items.*` governs them —
  // so they share the items gate this dialog already needs.
  const { rates: toleranceRates } = useToleranceRates({ enabled: canReadItems })
  const [file, setFile] = useState<File | null>(null)

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    setError,
    watch,
    formState: { errors },
  } = useForm<CentralStockForm>({
    resolver: zodResolver(schema),
    defaultValues: emptyValues,
  })

  const t1ValidationId = watch('t1ValidationId')
  const deportId = watch('deportId')

  /** An inactive deport is not a valid destination for new stock. */
  const selectableDeports = deports.filter((d) => d.status === 'active')

  /**
   * The chosen T1 already carries the item and the nominated quantity, through
   * `nomination.stock.item` — so neither is asked for. The item is submitted
   * from here; the quantity is only shown, since what is received may legitimately
   * differ from what was nominated.
   */
  const chosenT1 = validations.find((v) => v.id === t1ValidationId)
  const derivedItem = chosenT1?.nomination?.stock?.item ?? null
  // The nested nomination followed the same rename, so this reads through the
  // shared helper rather than the `quantity` that no longer exists.
  const nominatedQty = nominationQuantity(chosenT1?.nomination)
  const itemParent = itemRows.find((r) => r.id === derivedItem?.id)?.parentName
  const itemUnit = units.find((u) => u.id === derivedItem?.baseUnitId)?.code ?? ''

  /**
   * The two ceilings the received quantities are held to: what the T1 says was
   * in transit. Nothing may be received that was never shipped.
   *
   * Each quantity is bounded by its own counterpart — ambient against ambient,
   * corrected against corrected — since the two are measured differently and
   * comparing across them would reject legitimate figures.
   */
  const t1Ambient = Number(chosenT1?.nomination?.ambQuantity)
  const t1Corrected = nominatedQty

  const ambient = Number(watch('ambQuantity'))
  const corrected = Number(watch('quantityAt20C'))

  const exceedsAmbient =
    Number.isFinite(ambient) && Number.isFinite(t1Ambient) && t1Ambient > 0 && ambient > t1Ambient
  const exceedsCorrected =
    Number.isFinite(corrected) &&
    Number.isFinite(t1Corrected) &&
    t1Corrected > 0 &&
    corrected > t1Corrected

  /**
   * Whether what was received falls short of what was nominated. Compared
   * against the corrected figure, which is what the nomination is measured in.
   * Only under-delivery is worth noting now — over-delivery is rejected above.
   */
  const shortOrOver =
    Number.isFinite(corrected) &&
    corrected > 0 &&
    Number.isFinite(t1Corrected) &&
    t1Corrected > 0 &&
    corrected !== t1Corrected

  /**
   * The loss: what the T1 shipped at 20 °C minus what actually arrived at
   * 20 °C. Derived rather than typed, so it can never contradict the two
   * figures it comes from.
   *
   * Null until both are known, and floored at zero — a negative would mean more
   * arrived than shipped, which `exceedsCorrected` already rejects.
   */
  const lossQty =
    Number.isFinite(t1Corrected) && t1Corrected > 0 && Number.isFinite(corrected) && corrected > 0
      ? Math.max(0, t1Corrected - corrected)
      : null

  /**
   * The item's tolerance rate, if one has been set.
   *
   * ⚠️ Matched client-side from the full list: `/item-tolerance-rates/items/{id}`
   * is **not routed**, and the `?itemId=` filter is silently ignored — it
   * returns every row whatever id is passed, so filtering server-side would
   * hand back the wrong item's rate. Only `active` rates count.
   */
  const itemToleranceRate = toleranceRates.find(
    (rate) => rate.itemId === derivedItem?.id && rate.status !== 'inactive',
  )

  useEffect(() => {
    if (!open) return
    reset(emptyValues)
    setFile(null)
  }, [open, reset])

  /**
   * Choosing a T1 seeds the customs office and transit number from its first
   * check, since a receipt is usually cleared through the office the transit was
   * raised under. Both stay editable — the API records them separately here
   * precisely because they can differ.
   */
  function handleT1Change(value: string) {
    setValue('t1ValidationId', value, { shouldValidate: true })
    const chosen = validations.find((v) => v.id === value)
    const firstCheck = chosen?.extraValidations?.[0]
    if (firstCheck?.customOffice) setValue('customOffice', firstCheck.customOffice)
    if (firstCheck?.transitNumbering) setValue('transitNumbering', firstCheck.transitNumbering)

    /*
     * The T1 identifies the item, and the item carries its own tolerance rate —
     * so choosing a T1 fills it in. It stays editable: the rate on the item is
     * the standing allowance, and a receipt may be agreed at a different one.
     */
    const itemId = chosen?.nomination?.stock?.item?.id
    const rate = toleranceRates.find((r) => r.itemId === itemId && r.status !== 'inactive')
    setValue('toleranceRate', rate ? String(rate.maxRate) : '')
  }

  function onSubmit(values: CentralStockForm) {
    // The API still requires `itemId`; it comes from the T1 rather than the
    // user. If the T1 carries no item there is nothing valid to send, so this
    // reports it against the picker instead of submitting a blank id.
    if (!derivedItem?.id) {
      setError('t1ValidationId', {
        message: 'This T1 validation has no item — choose another.',
      })
      return
    }

    /*
     * Neither quantity may exceed what the T1 says was in transit. Checked here
     * as well as shown live, so a stale render cannot let one through — the
     * ceilings depend on the chosen T1, which a static schema cannot see.
     */
    if (exceedsAmbient) {
      setError('ambQuantity', {
        message: `Cannot exceed the ${t1Ambient.toLocaleString()} on the T1 validation`,
      })
      return
    }
    if (exceedsCorrected) {
      setError('quantityAt20C', {
        message: `Cannot exceed the ${t1Corrected.toLocaleString()} on the T1 validation`,
      })
      return
    }

    createCentralStock.mutate(
      {
        t1ValidationId: values.t1ValidationId,
        itemId: derivedItem.id,
        deportId: values.deportId,
        // Two quantities now — see `CentralStockRequest`.
        ambQuantity: Number(values.ambQuantity),
        quantityAt20C: Number(values.quantityAt20C),
        // Every optional figure is omitted when blank rather than sent as 0,
        // which would claim a measured zero rather than nothing recorded.
        ...(values.toleranceRate !== '' ? { toleranceRate: Number(values.toleranceRate) } : {}),
        // Derived from the T1 and the corrected quantity, never typed — see
        // `lossQty` above. Sent even when zero: a receipt that lost nothing is
        // a measured zero, not an absent figure.
        ...(lossQty !== null ? { lossQty } : {}),
        ...(values.gainQty !== '' ? { gainQty: Number(values.gainQty) } : {}),
        ...(values.customOffice.trim() ? { customOffice: values.customOffice.trim() } : {}),
        ...(values.transitNumbering.trim()
          ? { transitNumbering: values.transitNumbering.trim() }
          : {}),
        ...(values.blRef.trim() ? { blRef: values.blRef.trim() } : {}),
        // Omitted entirely when no file was chosen, rather than sent empty.
        ...(file ? { supportingDoc: file } : {}),
      },
      {
        onSuccess: () => {
          toast.success('Central stock recorded')
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
      title="New central stock"
      description="Stock received centrally against a T1 validation."
    >
      <form onSubmit={handleSubmit(onSubmit)} className="grid gap-4">
        <div className="grid gap-1.5">
          <Label htmlFor="t1ValidationId">T1 validation</Label>
          <Select
            value={t1ValidationId}
            onValueChange={handleT1Change}
          >
            <SelectTrigger id="t1ValidationId">
              <SelectValue placeholder="Select a T1 validation" />
            </SelectTrigger>
            <SelectContent>
              {validations.map((validation) => (
                <SelectItem key={validation.id} value={validation.id}>
                  {/* The item leads: it is what the T1 contributes here. */}
                  {validation.nomination?.stock?.item?.name ?? validation.exportingCountry}
                  {/* The renamed quantity, read through the shared helper. The
                      trimmed nomination here carries no `destination`. */}
                  {Number.isFinite(nominationQuantity(validation.nomination))
                    ? ` — ${nominationQuantity(validation.nomination).toLocaleString()}`
                    : ''}
                  {/* Two T1s can share an item, quantity and country, so the
                      customs office is included to tell them apart. */}
                  {` (${validation.exportingCountry}${
                    validation.extraValidations?.[0]?.customOffice
                      ? ` · ${validation.extraValidations[0].customOffice}`
                      : ''
                  })`}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {errors.t1ValidationId ? (
            <p className="text-sm text-destructive">{errors.t1ValidationId.message}</p>
          ) : (
            (validations.length === 0 ? (
              // Naming the reason: validations may well exist, just not
              // confirmed ones, and "none available" would send the user
              // looking for the wrong thing.
              <p className="text-xs text-muted-foreground">
                No confirmed T1 validations. A validation's customs checks must be confirmed
                before stock can be received against it.
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">
                Only validations whose customs checks have been confirmed are listed.
              </p>
            ))
          )}
        </div>

        {/* Read-only: the T1 determines the item, so it is shown rather than
            chosen. Picking it again could contradict the T1. */}
        {chosenT1 && (
          <div className="rounded-md border bg-muted/40 px-3 py-2">
            {derivedItem ? (
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <div>
                  <span className="text-xs text-muted-foreground">Item</span>
                  <p className="text-sm font-medium">
                    {derivedItem.name}
                    {itemParent && (
                      <span className="font-normal text-muted-foreground"> · {itemParent}</span>
                    )}
                  </p>
                </div>
                {Number.isFinite(nominatedQty) && nominatedQty > 0 && (
                  <div className="text-right">
                    <span className="text-xs text-muted-foreground">Nominated</span>
                    <p className="text-sm font-medium tabular-nums">
                      {nominatedQty.toLocaleString()}
                      {itemUnit ? ` ${itemUnit}` : ''}
                    </p>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                This T1 validation carries no item.
              </p>
            )}
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label htmlFor="deportId">Deport</Label>
            <Select
              value={deportId}
              onValueChange={(v) => setValue('deportId', v, { shouldValidate: true })}
            >
              <SelectTrigger id="deportId">
                <SelectValue placeholder="Select a deport" />
              </SelectTrigger>
              <SelectContent>
                {selectableDeports.map((deport) => (
                  <SelectItem key={deport.id} value={deport.id}>
                    {deport.name}
                    {deport.location ? ` — ${deport.location}` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.deportId && (
              <p className="text-sm text-destructive">{errors.deportId.message}</p>
            )}
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="ambQuantity">
              Ambient quantity
              {itemUnit && (
                <span className="ml-1 font-normal text-muted-foreground">({itemUnit})</span>
              )}
            </Label>
            <Input
              id="ambQuantity"
              type="number"
              min="0"
              step="any"
              max={Number.isFinite(t1Ambient) && t1Ambient > 0 ? t1Ambient : undefined}
              placeholder={
                Number.isFinite(t1Ambient) && t1Ambient > 0 ? String(t1Ambient) : '288'
              }
              {...register('ambQuantity')}
            />
            {errors.ambQuantity ? (
              <p className="text-sm text-destructive">{errors.ambQuantity.message}</p>
            ) : exceedsAmbient ? (
              // Shown as it is typed, not only on submit — nothing may be
              // received that the T1 does not say was shipped.
              <p className="text-sm text-destructive">
                Cannot exceed the {t1Ambient.toLocaleString()}
                {itemUnit ? ` ${itemUnit}` : ''} on the T1 validation
              </p>
            ) : (
              Number.isFinite(t1Ambient) &&
              t1Ambient > 0 && (
                <p className="text-xs text-muted-foreground">
                  Up to {t1Ambient.toLocaleString()}
                  {itemUnit ? ` ${itemUnit}` : ''} on the T1
                </p>
              )
            )}
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label htmlFor="quantityAt20C">
              Quantity at 20&nbsp;°C
              {itemUnit && (
                <span className="ml-1 font-normal text-muted-foreground">({itemUnit})</span>
              )}
            </Label>
            <Input
              id="quantityAt20C"
              type="number"
              min="0"
              step="any"
              max={Number.isFinite(t1Corrected) && t1Corrected > 0 ? t1Corrected : undefined}
              placeholder={
                Number.isFinite(t1Corrected) && t1Corrected > 0
                  ? String(t1Corrected)
                  : '287'
              }
              {...register('quantityAt20C')}
            />
            {errors.quantityAt20C ? (
              <p className="text-sm text-destructive">{errors.quantityAt20C.message}</p>
            ) : exceedsCorrected ? (
              <p className="text-sm text-destructive">
                Cannot exceed the {t1Corrected.toLocaleString()}
                {itemUnit ? ` ${itemUnit}` : ''} on the T1 validation
              </p>
            ) : shortOrOver ? (
              // A note, not an error: arriving short of what was shipped is
              // exactly the loss this form exists to record.
              <p className="text-xs text-muted-foreground">
                Under the {t1Corrected.toLocaleString()}
                {itemUnit ? ` ${itemUnit}` : ''} on the T1
              </p>
            ) : (
              Number.isFinite(t1Corrected) &&
              t1Corrected > 0 && (
                <p className="text-xs text-muted-foreground">
                  Up to {t1Corrected.toLocaleString()}
                  {itemUnit ? ` ${itemUnit}` : ''} on the T1
                </p>
              )
            )}
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="toleranceRate">
              Tolerance rate
              <span className="ml-1 font-normal text-muted-foreground">(optional)</span>
            </Label>
            <Input
              id="toleranceRate"
              type="number"
              step="any"
              placeholder="1"
              {...register('toleranceRate')}
            />
            {errors.toleranceRate ? (
              <p className="text-sm text-destructive">{errors.toleranceRate.message}</p>
            ) : itemToleranceRate ? (
              <p className="text-xs text-muted-foreground">
                {derivedItem?.name}&rsquo;s rate is{' '}
                {Number(itemToleranceRate.maxRate).toLocaleString()}. Editable for a
                one-off.
              </p>
            ) : (
              derivedItem && (
                <p className="text-xs text-muted-foreground">
                  No rate set for {derivedItem.name}. Set one on the Items page to have it
                  filled in.
                </p>
              )
            )}
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          {/* Read-only: the loss is the T1's quantity minus what arrived, so it
              is shown rather than asked for — a typed figure could contradict
              the two quantities it comes from. */}
          <div className="grid gap-1.5">
            <Label htmlFor="lossQty">Loss quantity</Label>
            <Input
              id="lossQty"
              readOnly
              tabIndex={-1}
              className="bg-muted/40"
              value={lossQty !== null ? lossQty.toLocaleString() : ''}
              placeholder="Enter the quantities above"
            />
            {lossQty !== null && (
              <p className="text-xs text-muted-foreground">
                {t1Corrected.toLocaleString()} on the T1 &minus;{' '}
                {corrected.toLocaleString()} received
              </p>
            )}
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="gainQty">
              Gain quantity
              <span className="ml-1 font-normal text-muted-foreground">(optional)</span>
            </Label>
            <Input
              id="gainQty"
              type="number"
              min="0"
              step="any"
              placeholder="0"
              {...register('gainQty')}
            />
            {errors.gainQty ? (
              <p className="text-sm text-destructive">{errors.gainQty.message}</p>
            ) : (
              <p className="text-xs text-muted-foreground">
                Typed, not derived — a gain is not the mirror of a loss.
              </p>
            )}
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div className="grid gap-1.5">
            <Label htmlFor="customOffice">
              Customs office
              <span className="ml-1 font-normal text-muted-foreground">(optional)</span>
            </Label>
            <Input id="customOffice" placeholder="Muhanga" {...register('customOffice')} />
            {errors.customOffice && (
              <p className="text-sm text-destructive">{errors.customOffice.message}</p>
            )}
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="transitNumbering">
              Transit number
              <span className="ml-1 font-normal text-muted-foreground">(optional)</span>
            </Label>
            <Input
              id="transitNumbering"
              placeholder="758484"
              {...register('transitNumbering')}
            />
            {errors.transitNumbering && (
              <p className="text-sm text-destructive">{errors.transitNumbering.message}</p>
            )}
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="blRef">
              BL reference
              <span className="ml-1 font-normal text-muted-foreground">(optional)</span>
            </Label>
            <Input id="blRef" {...register('blRef')} />
            {errors.blRef && (
              <p className="text-sm text-destructive">{errors.blRef.message}</p>
            )}
          </div>
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="supportingDoc">Supporting document</Label>
          <Input
            id="supportingDoc"
            type="file"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
          <p className="text-xs text-muted-foreground">Optional.</p>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            type="submit"
            // Blocked while either quantity exceeds the T1, so the invalid state
            // is visible rather than only reported after a click.
            disabled={createCentralStock.isPending || exceedsAmbient || exceedsCorrected}
          >
            {createCentralStock.isPending ? 'Recording…' : 'Record stock'}
          </Button>
        </DialogFooter>
      </form>
    </FormDialog>
  )
}
