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
import { useCargo, useCargoList, useSaveCargo } from '@/features/cargo/use-cargo'
import { useOrders } from '@/features/orders/use-orders'
import { useDeports } from '@/features/deports/use-deports'

const schema = z
  .object({
    orderId: z.string().min(1, 'Choose an order'),
    deportId: z.string().min(1, 'Choose a deport'),
    vesselName: z.string().trim().min(1, 'Vessel name is required'),
    receivedDate: z.string().min(1, 'Received date is required'),
    expirationDate: z.string().min(1, 'Expiration date is required'),
    /*
     * Two quantities now — `quantity` is gone from the API.
     *
     * `ambQuantity` is the volume at ambient temperature; `quantityAt20C` is
     * the same volume corrected to 20 °C, and it is the figure the order's
     * remaining stock is measured against.
     *
     * Both are kept as strings for the inputs and coerced on submit — the API
     * expects numbers even though it returns them as strings.
     */
    ambQuantity: z
      .string()
      .min(1, 'Ambient quantity is required')
      .refine((v) => Number(v) > 0, 'Must be greater than 0'),
    quantityAt20C: z
      .string()
      .min(1, 'Quantity at 20 °C is required')
      .refine((v) => Number(v) > 0, 'Must be greater than 0'),
    blRef: z.string().trim().min(1, 'BL reference is required'),
    tansisRef: z.string().trim(),
    outurnRef: z.string().trim(),
  })
  .refine((v) => !v.receivedDate || !v.expirationDate || v.expirationDate >= v.receivedDate, {
    path: ['expirationDate'],
    message: 'Must be on or after the received date',
  })

type CargoForm = z.infer<typeof schema>

const emptyValues: CargoForm = {
  orderId: '',
  deportId: '',
  vesselName: '',
  receivedDate: '',
  expirationDate: '',
  ambQuantity: '',
  quantityAt20C: '',
  blRef: '',
  tansisRef: '',
  outurnRef: '',
}

/** `<input type="date">` gives `YYYY-MM-DD`; the API wants a full ISO instant. */
const toIso = (date: string) => new Date(`${date}T00:00:00Z`).toISOString()
/** ISO instant back to `YYYY-MM-DD`, sliced so the UTC day never shifts. */
const toDateInput = (iso: string | undefined) => (iso ? iso.slice(0, 10) : '')

const FIELD_NAMES = [
  'orderId',
  'deportId',
  'vesselName',
  'receivedDate',
  'expirationDate',
  'ambQuantity',
  'quantityAt20C',
  'blRef',
  'tansisRef',
  'outurnRef',
] as const

export function CargoFormDialog({
  open,
  onOpenChange,
  cargoId,
  canReadOrders,
  canReadDeports,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /**
   * Present when editing. The list carries no `deportId` and only a nested
   * `order`, so the form fetches the record rather than being handed a row.
   */
  cargoId?: string | null
  /** Gated on `orders.read`, not the cargo permission. */
  canReadOrders: boolean
  /** Gated on `deports.read`, likewise. */
  canReadDeports: boolean
}) {
  const saveCargo = useSaveCargo()
  const isEdit = Boolean(cargoId)
  const { cargo: detail, isLoading: cargoLoading } = useCargo(
    open ? (cargoId ?? undefined) : undefined,
  )
  const { cargo: cargoList, isLoading: listLoading } = useCargoList({ enabled: isEdit })
  const { orders } = useOrders({ enabled: canReadOrders })
  const { deports } = useDeports({ enabled: canReadDeports })

  /**
   * The two endpoints carry **different halves of the record**, so editing
   * needs both:
   *
   * - **detail** — `deportId` and `quantity`, plus `order.itemId`
   * - **list**   — `vesselName`, the dates, and the three references, none of
   *   which the detail returns at all
   *
   * The detail also nests `order` without an `id`, so the order is taken from
   * the list row. Merging keeps the form working whichever endpoint carries a
   * field; if the detail regains them later, it wins.
   */
  const listRow = cargoList.find((c) => c.id === cargoId)
  const cargo =
    detail || listRow
      ? {
          ...listRow,
          ...detail,
          orderId: detail?.orderId ?? listRow?.order?.id,
          deportId: detail?.deportId ?? listRow?.deport?.id,
        }
      : null

  const [file, setFile] = useState<File | null>(null)

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    setError,
    watch,
    formState: { errors },
  } = useForm<CargoForm>({ resolver: zodResolver(schema), defaultValues: emptyValues })

  const orderId = watch('orderId')
  const deportId = watch('deportId')

  /**
   * An inactive deport stays selectable on the cargo that already uses it. The
   * currently selected id is included too, so the option is never missing for a
   * render — Radix would otherwise fall back to the placeholder.
   */
  const selectableDeports = deports.filter(
    (d) => d.status === 'active' || d.id === cargo?.deportId || d.id === deportId,
  )

  /** The chosen order, so its outstanding quantity can be shown alongside. */
  const chosenOrder = orders.find((o) => o.id === orderId)
  /** The unit the order is expressed in — cargo has no unit of its own. */
  const orderUnit = chosenOrder?.item?.baseUnit?.code ?? ''

  /**
   * How much of the order is still outstanding — **the API's own figure**.
   *
   * ⚠️ An earlier version added the edited cargo's quantity back on the theory
   * that `remainingStock` already counted it. It does not: `remainingStock` is
   * derived from **stock**, not from cargo, so the two are only equal when every
   * cargo happens to have produced matching stock. Adding anything back
   * overstated the remainder — an order with 500 left reported 1,500.
   *
   * The consequence is that editing a cargo cannot raise its quantity beyond
   * what the order still has outstanding, which is the correct constraint: the
   * shipment's own quantity is already reflected in that figure via its stock.
   */
  /*
   * ⚠️ **The order ceiling applies to `quantityAt20C`, not `ambQuantity`.**
   * A huge ambient figure with a small corrected one is accepted; the reverse
   * is refused with `The Cargo Quantities must be less than or equal to ordered
   * quanties.` So the corrected figure is what is compared here.
   */
  const quantityValue = Number(watch('quantityAt20C'))
  const remainingValue = Number(chosenOrder?.remainingStock)

  /**
   * Whether the cargo exceeds what is still outstanding.
   *
   * The API **does** refuse this now, with a `422` — it did not when this was
   * first written. Checking here too keeps the message on the field that caused
   * it rather than surfacing a bare toast.
   */
  const hasRemaining = Number.isFinite(remainingValue) && remainingValue > 0
  const overRemaining =
    hasRemaining && Number.isFinite(quantityValue) && quantityValue > 0 && quantityValue > remainingValue

  /** An order already fully delivered has nothing left to ship against. */
  const orderFullyDelivered = Number.isFinite(remainingValue) && remainingValue <= 0

  useEffect(() => {
    if (!open) return
    setFile(null)
    reset(
      cargo
        ? {
            orderId: cargo.orderId ?? '',
            deportId: cargo.deportId ?? '',
            // Every field below is optional on the merged record: each endpoint
            // returns only part of it, so none can be assumed present.
            vesselName: cargo.vesselName ?? '',
            receivedDate: toDateInput(cargo.receivedDate),
            expirationDate: toDateInput(cargo.expirationDate),
            // Quantity arrives as a string, so it drops straight into the input.
            ambQuantity: String(cargo.ambQuantity ?? ''),
            quantityAt20C: String(cargo.quantityAt20C ?? ''),
            blRef: cargo.blRef ?? '',
            tansisRef: cargo.tansisRef ?? '',
            outurnRef: cargo.outurnRef ?? '',
          }
        : emptyValues,
    )
    // Keyed on the two source records rather than the merged object, which is
    // rebuilt on every render and would otherwise re-run this endlessly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, detail, listRow, reset])

  function onSubmit(values: CargoForm) {
    // The button is disabled in these cases, but Enter still submits a form, so
    // the rule is enforced here as well rather than only in the markup.
    if (overRemaining || orderFullyDelivered) {
      setError('quantityAt20C', {
        message: orderFullyDelivered
          ? 'This order is fully delivered.'
          : `Only ${remainingValue.toLocaleString()}${orderUnit ? ` ${orderUnit}` : ''} remaining on this order.`,
      })
      return
    }

    saveCargo.mutate(
      {
        id: cargoId ?? undefined,
        orderId: values.orderId,
        deportId: values.deportId,
        vesselName: values.vesselName.trim(),
        receivedDate: toIso(values.receivedDate),
        expirationDate: toIso(values.expirationDate),
        ambQuantity: Number(values.ambQuantity),
        quantityAt20C: Number(values.quantityAt20C),
        blRef: values.blRef.trim(),
        // Optional fields are omitted rather than sent empty.
        ...(values.tansisRef.trim() ? { tansisRef: values.tansisRef.trim() } : {}),
        ...(values.outurnRef.trim() ? { outurnRef: values.outurnRef.trim() } : {}),
        ...(file ? { supportingDoc: file } : {}),
      },
      {
        onSuccess: () => {
          toast.success(isEdit ? 'Cargo updated' : 'Cargo created')
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
      title={isEdit ? 'Edit cargo' : 'New cargo'}
      description="A shipment received against an order."
    >
      <form
        onSubmit={handleSubmit(onSubmit)}
        className="grid max-h-[70vh] gap-4 overflow-y-auto pr-1"
      >
        <div className="grid gap-1.5">
          <Label htmlFor="orderId">Order</Label>
          <Select
            value={orderId}
            onValueChange={(v) => setValue('orderId', v, { shouldValidate: true })}
          >
            <SelectTrigger id="orderId">
              <SelectValue placeholder="Select an order" />
            </SelectTrigger>
            <SelectContent>
              {orders.map((order) => (
                <SelectItem key={order.id} value={order.id}>
                  {order.orderCode}
                  {order.item?.name ? ` — ${order.item.name}` : ''}
                  {/* What is still **outstanding**, not the order total: that
                      is the figure a new cargo has to fit inside. */}
                  {Number.isFinite(Number(order.remainingStock))
                    ? ` (${Number(order.remainingStock).toLocaleString()}${
                        order.item?.baseUnit?.code ? ` ${order.item.baseUnit.code}` : ''
                      } left)`
                    : order.quantity
                      ? ` (${Number(order.quantity).toLocaleString()}${
                          order.item?.baseUnit?.code ? ` ${order.item.baseUnit.code}` : ''
                        })`
                      : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {errors.orderId ? (
            <p className="text-sm text-destructive">{errors.orderId.message}</p>
          ) : orderFullyDelivered ? (
            // Nothing left to ship against, so this is an error rather than a
            // note — it blocks submission below.
            <p className="text-sm text-destructive">
              This order is fully delivered ({Number(chosenOrder?.quantity).toLocaleString()}
              {orderUnit ? ` ${orderUnit}` : ''}). Choose another.
            </p>
          ) : (
            chosenOrder && (
              <p className="text-xs text-muted-foreground">
                <span className="font-medium text-foreground">
                  {remainingValue.toLocaleString()}
                  {orderUnit ? ` ${orderUnit}` : ''}
                </span>{' '}
                remaining of {Number(chosenOrder.quantity).toLocaleString()} ordered
                {chosenOrder.supplier?.name ? ` · ${chosenOrder.supplier.name}` : ''}
              </p>
            )
          )}
        </div>

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
          <Label htmlFor="vesselName">Vessel name</Label>
          <Input id="vesselName" placeholder="Vessel 6" {...register('vesselName')} />
          {errors.vesselName && (
            <p className="text-sm text-destructive">{errors.vesselName.message}</p>
          )}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label htmlFor="receivedDate">Received date</Label>
            <Input id="receivedDate" type="date" {...register('receivedDate')} />
            {errors.receivedDate && (
              <p className="text-sm text-destructive">{errors.receivedDate.message}</p>
            )}
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="expirationDate">Expiration date</Label>
            <Input id="expirationDate" type="date" {...register('expirationDate')} />
            {errors.expirationDate && (
              <p className="text-sm text-destructive">{errors.expirationDate.message}</p>
            )}
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label htmlFor="ambQuantity">
              Ambient quantity
              {/* Cargo carries no unit of its own, so the order's is shown to
                  make clear which one the number is in. */}
              {orderUnit && (
                <span className="ml-1 font-normal text-muted-foreground">({orderUnit})</span>
              )}
            </Label>
            <Input
              id="ambQuantity"
              type="number"
              min="0"
              step="any"
              placeholder="288"
              {...register('ambQuantity')}
            />
            {errors.ambQuantity ? (
              <p className="text-sm text-destructive">{errors.ambQuantity.message}</p>
            ) : (
              // Deliberately not capped: the order ceiling applies to the
              // corrected figure, not this one.
              <p className="text-xs text-muted-foreground">
                Volume as measured, at ambient temperature.
              </p>
            )}
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="quantityAt20C">
              Quantity at 20&nbsp;°C
              {orderUnit && (
                <span className="ml-1 font-normal text-muted-foreground">({orderUnit})</span>
              )}
            </Label>
            <Input
              id="quantityAt20C"
              type="number"
              min="0"
              step="any"
              // Capped at what is outstanding, so the stepper cannot walk past
              // it — this is the figure the API bounds by the order.
              max={hasRemaining ? remainingValue : undefined}
              placeholder={hasRemaining ? String(remainingValue) : '288'}
              aria-invalid={overRemaining || undefined}
              {...register('quantityAt20C')}
            />
            {errors.quantityAt20C ? (
              <p className="text-sm text-destructive">{errors.quantityAt20C.message}</p>
            ) : overRemaining ? (
              // The API refuses this with a 422; blocking here keeps the
              // message on the field that caused it.
              <p className="text-sm text-destructive">
                Only {remainingValue.toLocaleString()}
                {orderUnit ? ` ${orderUnit}` : ''} remaining on this order.
              </p>
            ) : hasRemaining ? (
              <p className="text-xs text-muted-foreground">
                Up to {remainingValue.toLocaleString()}
                {orderUnit ? ` ${orderUnit}` : ''} — this is the figure the order is
                measured against.
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">
                Temperature-corrected volume, which the order is measured against.
              </p>
            )}
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div className="grid gap-1.5">
            <Label htmlFor="blRef">BL reference</Label>
            <Input id="blRef" placeholder="Reffs" {...register('blRef')} />
            {errors.blRef && <p className="text-sm text-destructive">{errors.blRef.message}</p>}
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="tansisRef">Tansis ref</Label>
            <Input id="tansisRef" placeholder="Optional" {...register('tansisRef')} />
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="outurnRef">Outurn ref</Label>
            <Input id="outurnRef" placeholder="Optional" {...register('outurnRef')} />
          </div>
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="supportingDoc">Supporting document</Label>
          <Input
            id="supportingDoc"
            type="file"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
          {isEdit && cargo?.supportingDocUrl && !file ? (
            <a
              href={cargo.supportingDocUrl}
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
              the existing cargo. */}
          {/* Both sources must arrive: saving on a half-loaded record would
              submit blanks over the fields the other endpoint carries. */}
          <Button
            type="submit"
            // Blocked while the quantity exceeds what the order has left, or
            // the order has nothing left at all.
            disabled={
              saveCargo.isPending ||
              cargoLoading ||
              (isEdit && listLoading) ||
              overRemaining ||
              orderFullyDelivered
            }
          >
            {saveCargo.isPending
              ? isEdit
                ? 'Saving…'
                : 'Creating…'
              : isEdit
                ? 'Save changes'
                : 'Create cargo'}
          </Button>
        </DialogFooter>
      </form>
    </FormDialog>
  )
}
