import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { ArrowDownLeft, ArrowUpRight } from 'lucide-react'
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
import { useReconcileCentralStock } from '@/features/central-stock/use-central-stock'
import {
  RECONCILIATION_STATES,
  type CentralStock,
  type ReconciliationState,
  type ReconciliationType,
} from '@/api/types'

const schema = z.object({
  // Kept as a string throughout: unlike the multipart create, this endpoint
  // takes the quantity as a string.
  quantity: z
    .string()
    .min(1, 'Quantity is required')
    .refine((v) => Number(v) > 0, 'Must be greater than 0'),
  reconciliationType: z.enum(['reconcilliationIn', 'reconcilliationOut']),
  state: z.enum(['cleared', 'uncleared']),
})

type ReconciliationForm = z.infer<typeof schema>

const emptyValues: ReconciliationForm = {
  quantity: '',
  // An adjustment upward is the safer default: it cannot exceed a bound.
  reconciliationType: 'reconcilliationIn',
  state: 'uncleared',
}

const FIELD_NAMES = ['quantity', 'reconciliationType', 'state'] as const

/** Labels the misspelled enum values without repeating the misspelling to the user. */
const TYPE_LABELS: Record<ReconciliationType, string> = {
  reconcilliationIn: 'In — increase this receipt',
  reconcilliationOut: 'Out — decrease this receipt',
}

const STATE_LABELS: Record<ReconciliationState, string> = {
  cleared: 'Cleared — customs cleared',
  uncleared: 'Uncleared — not yet cleared',
}

/**
 * Adjusts one central stock receipt up or down.
 *
 * 🔴 **The endpoint has not shipped** — see `central-stock.service.ts`. A `404`
 * is surfaced with an explanation rather than the raw message, so the failure
 * does not read as a bug in the form.
 */
export function ReconciliationDialog({
  open,
  onOpenChange,
  stock,
  unitCode,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** The receipt being adjusted. `null` closes the dialog. */
  stock: CentralStock | null
  /** The item's unit, for labelling the quantity. */
  unitCode?: string
}) {
  const reconcile = useReconcileCentralStock()

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    setError,
    watch,
    formState: { errors },
  } = useForm<ReconciliationForm>({ resolver: zodResolver(schema), defaultValues: emptyValues })

  const reconciliationType = watch('reconciliationType')
  const state = watch('state')
  const quantity = Number(watch('quantity'))

  const isOut = reconciliationType === 'reconcilliationOut'

  /**
   * Which clearance states this receipt can actually be reconciled into.
   *
   * Driven by the receipt's own `clearances[]` rather than the full enum: a
   * receipt that has never been cleared has no cleared quantity to adjust, so
   * offering `cleared` would invite an adjustment against nothing. In live data
   * every clearance is `uncleared`, so only that is offered today — but this
   * widens on its own once clearing happens, with no code change.
   */
  const availableStates = RECONCILIATION_STATES.filter((value) =>
    (stock?.clearances ?? []).some((clearance) => clearance.status === value),
  )

  /**
   * Fall back to the full list when the receipt carries no clearances at all,
   * rather than rendering an empty dropdown that cannot be completed.
   */
  const selectableStates = availableStates.length > 0 ? availableStates : RECONCILIATION_STATES

  /** With one option there is no decision to make, so the control is locked. */
  const isStateForced = selectableStates.length === 1

  /**
   * How much of the receipt sits in each clearance state, e.g. `150 cleared`.
   *
   * ⚠️ Reads `quantity` — a clearance no longer carries `remainingQuantity`.
   * The uncleared remainder comes from the receipt's own `unclearedQuantity`
   * rather than being derived here.
   */
  const clearanceBreakdown = Object.entries(
    (stock?.clearances ?? []).reduce<Record<string, number>>((totals, clearance) => {
      const quantity = Number(clearance.quantity)
      if (!Number.isFinite(quantity)) return totals
      totals[clearance.status] = (totals[clearance.status] ?? 0) + quantity
      return totals
    }, {}),
  )

  // The receipt reports this directly now, so it is shown rather than inferred.
  const uncleared = Number(stock?.unclearedQuantity)
  if (Number.isFinite(uncleared) && uncleared > 0) {
    clearanceBreakdown.push(['uncleared', uncleared])
  }

  // Declared after `selectableStates` so the seed below can read it.
  useEffect(() => {
    if (!open) return
    // Seeded from what the receipt actually holds, so the control never opens
    // showing a state this receipt has no quantity in.
    reset({ ...emptyValues, state: selectableStates[0] })
    // `selectableStates` is derived from `stock`, which is the real dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, stock, reset])

  /**
   * An outward adjustment cannot remove more than the receipt still holds.
   * Applied client-side only — the endpoint does not exist to enforce it, and
   * a figure that would obviously be rejected is better caught before sending.
   */
  const remaining = Number(stock?.remainingQuantity)
  const exceedsRemaining =
    isOut && Number.isFinite(remaining) && Number.isFinite(quantity) && quantity > remaining

  /** What the receipt would hold afterwards, so the effect is visible. */
  const projected =
    Number.isFinite(remaining) && Number.isFinite(quantity) && quantity > 0
      ? remaining + (isOut ? -quantity : quantity)
      : null

  function onSubmit(values: ReconciliationForm) {
    if (!stock) return
    if (exceedsRemaining) {
      setError('quantity', { message: `Only ${remaining.toLocaleString()} remaining` })
      return
    }

    reconcile.mutate(
      {
        centralStockId: stock.id,
        quantity: values.quantity,
        reconciliationType: values.reconciliationType,
        state: values.state,
      },
      {
        onSuccess: () => {
          toast.success('Stock reconciled')
          onOpenChange(false)
        },
        onError: (err) => {
          // The route is absent rather than rejecting the body, so a 404 here
          // means "not deployed", not "wrong input".
          if (errorCode(err) === 'ROUTE_NOT_FOUND') {
            toast.error('Reconciliation is not available yet on the server.')
            return
          }

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
      title="Reconcile stock"
      description="Adjust this receipt up or down to match what is physically held."
    >
      <form onSubmit={handleSubmit(onSubmit)} className="grid gap-4">
        {/* Read-only: the receipt is chosen by the row the action was taken
            from, so re-picking it here could only contradict that. */}
        <div className="rounded-md border bg-muted/40 px-3 py-2">
          {stock ? (
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <div>
                <span className="text-xs text-muted-foreground">Receipt</span>
                <p className="text-sm font-medium">{stock.depot?.name ?? 'Depot'}</p>
                {stock.t1Validation && (
                  <p className="text-xs text-muted-foreground">
                    via {stock.t1Validation.exportingCountry}
                  </p>
                )}
              </div>
              <div className="text-right">
                <span className="text-xs text-muted-foreground">Remaining</span>
                <p className="text-sm font-medium tabular-nums">
                  {Number.isFinite(remaining) ? remaining.toLocaleString() : '—'}
                  {unitCode && (
                    <span className="ml-1 text-xs font-normal text-muted-foreground">
                      {unitCode}
                    </span>
                  )}
                </p>
                {/* What is cleared and what is not, so the locked control below
                    reads as a fact about this receipt rather than a limitation
                    of the form. */}
                {clearanceBreakdown.length > 0 && (
                  <p className="text-xs text-muted-foreground">
                    {clearanceBreakdown
                      .map(([status, qty]) => `${qty.toLocaleString()} ${status}`)
                      .join(' · ')}
                  </p>
                )}
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No receipt selected.</p>
          )}
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="reconciliationType">Direction</Label>
          <Select
            value={reconciliationType}
            onValueChange={(v) =>
              setValue('reconciliationType', v as ReconciliationType, { shouldValidate: true })
            }
          >
            <SelectTrigger id="reconciliationType">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {/* Iterated from the constant so the misspelled API values stay
                  in one place — see `RECONCILIATION_TYPES`. */}
              {(Object.keys(TYPE_LABELS) as ReconciliationType[]).map((value) => (
                <SelectItem key={value} value={value}>
                  <span className="flex items-center gap-2">
                    {value === 'reconcilliationOut' ? (
                      <ArrowDownLeft className="size-3.5" />
                    ) : (
                      <ArrowUpRight className="size-3.5" />
                    )}
                    {TYPE_LABELS[value]}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {errors.reconciliationType && (
            <p className="text-sm text-destructive">{errors.reconciliationType.message}</p>
          )}
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="quantity">
            Quantity
            {unitCode && <span className="ml-1 font-normal text-muted-foreground">({unitCode})</span>}
          </Label>
          <Input
            id="quantity"
            type="number"
            min="0"
            step="any"
            placeholder="30"
            {...register('quantity')}
          />
          {errors.quantity ? (
            <p className="text-sm text-destructive">{errors.quantity.message}</p>
          ) : exceedsRemaining ? (
            <p className="text-sm text-destructive">
              Only {remaining.toLocaleString()} remaining on this receipt.
            </p>
          ) : (
            projected !== null && (
              // The arithmetic is shown so a wrong direction or figure is
              // visible before it is sent.
              <p className="text-xs text-muted-foreground">
                {remaining.toLocaleString()} {isOut ? '−' : '+'} {quantity.toLocaleString()} ={' '}
                <span className="font-medium text-foreground">
                  {projected.toLocaleString()}
                </span>
                {unitCode ? ` ${unitCode}` : ''}
              </p>
            )
          )}
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="state">Clearance</Label>
          <Select
            value={state}
            // Nothing to choose between when the receipt holds only one state,
            // so the control is locked rather than shown as a decision.
            disabled={isStateForced}
            onValueChange={(v) => setValue('state', v as ReconciliationState, { shouldValidate: true })}
          >
            <SelectTrigger id="state">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {/* Only the states this receipt actually holds — see
                  `selectableStates`. */}
              {selectableStates.map((value) => (
                <SelectItem key={value} value={value}>
                  {STATE_LABELS[value]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {errors.state ? (
            <p className="text-sm text-destructive">{errors.state.message}</p>
          ) : isStateForced ? (
            <p className="text-xs text-muted-foreground">
              This receipt is entirely {STATE_LABELS[selectableStates[0]].split(' — ')[0].toLowerCase()},
              so there is nothing else to reconcile against.
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">
              Whether the adjusted quantity has cleared customs.
            </p>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" disabled={reconcile.isPending || !stock || exceedsRemaining}>
            {reconcile.isPending ? 'Reconciling…' : 'Reconcile'}
          </Button>
        </DialogFooter>
      </form>
    </FormDialog>
  )
}
