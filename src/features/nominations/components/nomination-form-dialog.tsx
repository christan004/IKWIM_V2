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
import { errorMessage, fieldErrors } from '@/lib/error-message'
import { nominationQuantity } from '@/api/types'
import { useNomination, useSaveNomination } from '@/features/nominations/use-nominations'
import { useStockList } from '@/features/stock/use-stock'
import { useDrivers } from '@/features/drivers/use-drivers'
import { useItems } from '@/features/items/use-items'

const schema = z.object({
  stockId: z.string().min(1, 'Choose stock'),
  driverVehicleId: z.string().min(1, 'Choose a driver and vehicle'),
  destination: z.string().min(1, 'Destination is required'),
  /*
   * Two quantities now — `quantity` is gone, the same rename cargo received.
   *
   * `quantityAt20C` is the temperature-corrected volume and is **required**;
   * `ambQuantity` is what was measured and is **optional**, so it is allowed to
   * be blank and omitted from the body.
   *
   * Both kept as strings for the inputs and coerced on submit.
   */
  quantityAt20C: z
    .string()
    .min(1, 'Quantity at 20 °C is required')
    .refine((v) => Number(v) > 0, 'Must be greater than 0'),
  ambQuantity: z
    .string()
    .refine((v) => v === '' || Number(v) > 0, 'Must be greater than 0'),
  expectedLoadingDate: z.string().min(1, 'Expected loading date is required'),
})

type NominationForm = z.infer<typeof schema>

const emptyValues: NominationForm = {
  stockId: '',
  driverVehicleId: '',
  destination: '',
  quantityAt20C: '',
  ambQuantity: '',
  expectedLoadingDate: '',
}

/** `<input type="date">` gives `YYYY-MM-DD`; the API wants a full ISO instant. */
const toIso = (date: string) => new Date(`${date}T00:00:00Z`).toISOString()
/** ISO instant back to `YYYY-MM-DD`, sliced so the UTC day never shifts. */
const toDateInput = (iso: string | undefined) => (iso ? iso.slice(0, 10) : '')

/**
 * Form field names, mapped to the request field they correspond to. The date is
 * the odd one out: the API reports errors against `expectedLoadingedDate`, but
 * the form field is spelled without the extra `ed`.
 */
const FIELD_MAP = {
  stockId: 'stockId',
  driverVehicleId: 'driverVehicleId',
  destination: 'destination',
  quantityAt20C: 'quantityAt20C',
  ambQuantity: 'ambQuantity',
  expectedLoadingedDate: 'expectedLoadingDate',
} as const satisfies Record<string, keyof NominationForm>

export function NominationFormDialog({
  open,
  onOpenChange,
  nominationId,
  stockId: presetStockId,
  canReadStock,
  canReadDrivers,
  canReadItems,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Present when editing; the record is fetched to seed the form. */
  nominationId?: string | null
  /**
   * The stock to nominate from, when creating. Nominations are raised from the
   * Stock page against a specific receipt, so the stock is **given** rather than
   * picked — there is no item/stock picker here at all.
   */
  stockId?: string | null
  /** Gated on `stock.read`, not the nominations permission. */
  canReadStock: boolean
  /** Gated on `drivers.read`, likewise. */
  canReadDrivers: boolean
  /** Gated on `items.read` — only used to name the item's parent. */
  canReadItems: boolean
}) {
  const saveNomination = useSaveNomination()
  const isEdit = Boolean(nominationId)
  // The list carries no ids, so editing *must* read the detail endpoint.
  const { nomination, isLoading: nominationLoading } = useNomination(
    open ? (nominationId ?? undefined) : undefined,
  )
  const { groups, stock } = useStockList({ enabled: canReadStock })
  const { drivers } = useDrivers({ enabled: canReadDrivers })
  // The stock item now carries a resolved `baseUnit`, so only the parent still
  // needs the items tree — the item shape has no `parentId` of its own.
  const { rows: itemRows } = useItems({ enabled: canReadItems })

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    setError,
    watch,
    formState: { errors },
  } = useForm<NominationForm>({ resolver: zodResolver(schema), defaultValues: emptyValues })

  const stockId = watch('stockId')
  const driverVehicleId = watch('driverVehicleId')

  /** The group holding the chosen stock, for the item name and unit. */
  const chosenGroup = groups.find((g) => (g.stocks ?? []).some((x) => x.id === stockId))

  /**
   * Flattened driver→vehicle assignments. The value is the **assignment** id,
   * which is what the API wants — not the vehicle's own id.
   */
  const assignments = drivers.flatMap((driver) =>
    (driver.vehicles ?? []).map((assignment) => ({
      id: assignment.id,
      driverName: driver.names,
      plate: assignment.vechile.platNumber,
      active: assignment.vechile.status === 'active',
    })),
  )

  const selectableAssignments = assignments.filter(
    (a) => a.active || a.id === nomination?.driverVehicleId || a.id === driverVehicleId,
  )

  useEffect(() => {
    if (!open) return
    reset(
      nomination
        ? {
            // On edit the record names its own stock; on create it is given.
            stockId: nomination.stockId ?? '',
            driverVehicleId: nomination.driverVehicleId ?? '',
            destination: nomination.destination ?? '',
            // The response field is unconfirmed, so this reads through the
            // shared helper rather than one guessed name.
            quantityAt20C: String(nominationQuantity(nomination) || ''),
            ambQuantity: String(nomination.ambQuantity ?? ''),
            expectedLoadingDate: toDateInput(nomination.expectedLoadingDate),
          }
        : { ...emptyValues, stockId: presetStockId ?? '' },
    )
  }, [open, nomination, presetStockId, reset])

  function onSubmit(values: NominationForm) {
    // The button is disabled in this case, but Enter still submits a form, so
    // the rule is enforced here as well rather than only in the markup.
    if (overStock) {
      setError('quantityAt20C', {
        message: `Only ${availableValue.toLocaleString()}${chosenUnit ? ` ${chosenUnit}` : ''} available on this stock.`,
      })
      return
    }

    saveNomination.mutate(
      {
        id: nominationId ?? undefined,
        stockId: values.stockId,
        driverVehicleId: values.driverVehicleId,
        destination: values.destination,
        quantityAt20C: Number(values.quantityAt20C),
        // Optional — omitted entirely when blank rather than sent as 0.
        ...(values.ambQuantity !== '' ? { ambQuantity: Number(values.ambQuantity) } : {}),
        // Note the spelling — the request field carries an extra `ed`.
        expectedLoadingedDate: toIso(values.expectedLoadingDate),
      },
      {
        onSuccess: () => {
          toast.success(isEdit ? 'Nomination updated' : 'Nomination created')
          onOpenChange(false)
        },
        onError: (err) => {
          const fields = fieldErrors(err)
          if (fields) {
            let matched = false
            for (const [apiField, formField] of Object.entries(FIELD_MAP)) {
              const message = fields[apiField]
              if (message) {
                setError(formField, { message })
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

  const chosenStock = stock.find((s) => s.id === stockId)
  const chosenUnit = chosenGroup?.item?.baseUnit?.code ?? chosenStock?.item?.baseUnit?.code ?? ''
  /** The item's parent, which is what gives a name like "AGO" its context. */
  const chosenItemParent = itemRows.find((r) => r.id === chosenGroup?.item?.id)?.parentName

  /**
   * How much of the chosen stock is still available.
   *
   * `remainingQuantity` is already net of every nomination — **including the
   * one being edited** — so the record's own quantity is added back when it
   * draws on this same stock. Without that, an unchanged nomination could not
   * be re-saved. Same reasoning as the cargo form's remaining check.
   */
  // ⚠️ The stock ceiling applies to the corrected figure, matching cargo.
  const quantityValue = Number(watch('quantityAt20C'))
  const stockRemaining = Number(chosenStock?.remainingQuantity)

  const editingThisStock = isEdit && nomination?.stockId === stockId
  const ownContribution = editingThisStock ? nominationQuantity(nomination) : 0

  const availableValue = Number.isFinite(stockRemaining)
    ? stockRemaining + (Number.isFinite(ownContribution) ? ownContribution : 0)
    : Number.NaN

  const hasAvailable = Number.isFinite(availableValue) && availableValue > 0

  /**
   * Blocking, unlike before: `remainingQuantity` is a real balance net of other
   * nominations, so exceeding it would double-allocate the same stock. The API
   * still accepts it, so this is a client-side guard.
   */
  const overStock =
    hasAvailable && Number.isFinite(quantityValue) && quantityValue > 0 && quantityValue > availableValue

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={isEdit ? 'Edit nomination' : 'New nomination'}
      description="Allocate stock to a driver's vehicle for delivery."
    >
      <form onSubmit={handleSubmit(onSubmit)} className="grid gap-4">
        {/* Read-only: the nomination is raised against a stock the user has
            already chosen on the Stock page, so re-picking it here could only
            contradict where they started. */}
        <div className="rounded-md border bg-muted/40 px-3 py-2">
          {chosenStock ? (
            <div className="grid gap-1">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <div>
                  <span className="text-xs text-muted-foreground">Stock</span>
                  <p className="text-sm font-medium">
                    {chosenGroup?.item?.name ?? 'Stock'}
                    {chosenItemParent && (
                      <span className="font-normal text-muted-foreground"> · {chosenItemParent}</span>
                    )}
                  </p>
                </div>
                <div className="text-right">
                  <span className="text-xs text-muted-foreground">Available</span>
                  <p className="text-sm font-medium tabular-nums">
                    {availableValue.toLocaleString()}
                    {chosenUnit ? ` ${chosenUnit}` : ''}
                  </p>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                {chosenStock.cargo?.vesselName ?? '—'}
                {chosenStock.depot?.name ? ` · ${chosenStock.depot.name}` : ''}
                {chosenStock.cargo?.blRef ? ` · BL ${chosenStock.cargo.blRef}` : ''}
                {Number(chosenStock.nominatedQuantity) > 0
                  ? ` · ${Number(chosenStock.nominatedQuantity).toLocaleString()} of ${Number(
                      chosenStock.quantityBeforeNominations,
                    ).toLocaleString()} already nominated`
                  : ''}
              </p>
            </div>
          ) : (
            // The stock list may still be loading, or the record may point at
            // stock the user cannot read.
            <p className="text-sm text-muted-foreground">Stock details unavailable.</p>
          )}
          {errors.stockId && (
            <p className="mt-1 text-sm text-destructive">{errors.stockId.message}</p>
          )}
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="driverVehicleId">Driver and vehicle</Label>
          <Select
            value={driverVehicleId}
            onValueChange={(v) => setValue('driverVehicleId', v, { shouldValidate: true })}
          >
            <SelectTrigger id="driverVehicleId">
              <SelectValue placeholder="Select a driver" />
            </SelectTrigger>
            <SelectContent>
              {selectableAssignments.map((assignment) => (
                <SelectItem key={assignment.id} value={assignment.id}>
                  {assignment.driverName} — {assignment.plate}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {errors.driverVehicleId ? (
            <p className="text-sm text-destructive">{errors.driverVehicleId.message}</p>
          ) : (
            assignments.length === 0 && (
              <p className="text-xs text-muted-foreground">
                No vehicles are assigned to a driver yet.
              </p>
            )
          )}
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="destination">Destination</Label>
          <Input id="destination" placeholder="Kigali" {...register('destination')} />
          {errors.destination && (
            <p className="text-sm text-destructive">{errors.destination.message}</p>
          )}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label htmlFor="quantityAt20C">
              Quantity at 20&nbsp;°C
              {/* The unit comes from the stock's item — a nomination has none
                  of its own, so the number is ambiguous without it. */}
              {chosenUnit && (
                <span className="ml-1 font-normal text-muted-foreground">({chosenUnit})</span>
              )}
            </Label>
            <Input
              id="quantityAt20C"
              type="number"
              min="0"
              step="any"
              // Capped at what the stock has left, so the stepper cannot walk
              // past it — this is the figure the stock is measured against.
              max={hasAvailable ? availableValue : undefined}
              placeholder={hasAvailable ? String(availableValue) : '30000'}
              aria-invalid={overStock || undefined}
              {...register('quantityAt20C')}
            />
            {errors.quantityAt20C ? (
              <p className="text-sm text-destructive">{errors.quantityAt20C.message}</p>
            ) : overStock ? (
              // Blocking now that `remainingQuantity` is a real balance net of
              // other nominations — exceeding it double-allocates the stock.
              <p className="text-sm text-destructive">
                Only {availableValue.toLocaleString()}
                {chosenUnit ? ` ${chosenUnit}` : ''} available on this stock.
              </p>
            ) : (
              hasAvailable && (
                <p className="text-xs text-muted-foreground">
                  Up to {availableValue.toLocaleString()}
                  {chosenUnit ? ` ${chosenUnit}` : ''} can be nominated.
                </p>
              )
            )}
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="ambQuantity">
              Ambient quantity
              {chosenUnit && (
                <span className="ml-1 font-normal text-muted-foreground">({chosenUnit})</span>
              )}
            </Label>
            <Input
              id="ambQuantity"
              type="number"
              min="0"
              step="any"
              placeholder="30000"
              {...register('ambQuantity')}
            />
            {errors.ambQuantity ? (
              <p className="text-sm text-destructive">{errors.ambQuantity.message}</p>
            ) : (
              // Optional, and deliberately uncapped: the stock ceiling applies
              // to the corrected figure, not this one.
              <p className="text-xs text-muted-foreground">
                Optional — volume as measured, at ambient temperature.
              </p>
            )}
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="expectedLoadingDate">Expected loading date</Label>
            <Input id="expectedLoadingDate" type="date" {...register('expectedLoadingDate')} />
            {errors.expectedLoadingDate && (
              <p className="text-sm text-destructive">{errors.expectedLoadingDate.message}</p>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          {/* Saving before the record arrives would submit an empty form over
              the existing nomination. */}
          <Button type="submit" disabled={saveNomination.isPending || nominationLoading || overStock}>
            {saveNomination.isPending
              ? isEdit
                ? 'Saving…'
                : 'Creating…'
              : isEdit
                ? 'Save changes'
                : 'Create nomination'}
          </Button>
        </DialogFooter>
      </form>
    </FormDialog>
  )
}
