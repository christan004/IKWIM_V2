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
import { useCuves } from '@/features/cuves/use-cuves'
import { useReceiveOrder } from '@/features/stockout-orders/use-stockout-orders'
import type { ReceptionOrder } from '@/api/types'

const schema = z.object({
  cuveId: z.string().min(1, 'Choose a cuve'),
  // Kept as a string for the input, coerced on submit. The API rejects zero and
  // negatives outright, so the same bound is applied here.
  receivedQty: z
    .string()
    .min(1, 'Received quantity is required')
    .refine((v) => Number(v) > 0, 'Must be greater than 0'),
})

type ReceiveForm = z.infer<typeof schema>

const emptyValues: ReceiveForm = { cuveId: '', receivedQty: '' }

const FIELD_NAMES = ['cuveId', 'receivedQty'] as const

/** Quantities arrive as strings, so they are parsed before formatting. */
function formatQty(value: string | number | undefined | null): string {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed.toLocaleString() : '—'
}

/**
 * Receives a loading order's fuel into a cuve.
 *
 * 🔒 Site managers only — the API refuses anyone else outright. The page shows
 * the button on that basis; this dialog surfaces the refusal verbatim if the
 * rule ever fires anyway.
 */
export function ReceiveOrderDialog({
  open,
  onOpenChange,
  order,
  canReadCuves,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** The loading order being received. `null` closes the dialog. */
  order: ReceptionOrder | null
  /** Gated on `cuve.read`, not the stockout permission. */
  canReadCuves: boolean
}) {
  const receiveOrder = useReceiveOrder()
  const { cuves } = useCuves({ enabled: open && canReadCuves })

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    setError,
    watch,
    formState: { errors },
  } = useForm<ReceiveForm>({ resolver: zodResolver(schema), defaultValues: emptyValues })

  const cuveId = watch('cuveId')
  const receivedQty = Number(watch('receivedQty'))

  useEffect(() => {
    if (!open) return
    reset(emptyValues)
  }, [open, reset])

  /**
   * What is still to receive. Falls back to the total when the API has not
   * computed one — a load with nothing received yet owes all of it.
   */
  const remaining = Number(order?.remainingQuantity ?? order?.totalQuantity)

  /**
   * The item on this load, taken from its first line. Every line on a loading
   * order draws from the same central stock, so one lookup describes them all.
   */
  const loadedItem = order?.loadedOrders?.[0]?.order?.centralStock?.item
  const unitCode = loadedItem?.baseUnit?.code ?? ''

  /**
   * Cuves that can take this fuel.
   *
   * A tank holds one product, so offering a PMS cuve for an AGO load would only
   * invite a rejected submit. Inactive tanks are excluded for the same reason.
   * When the item cannot be determined, every active cuve is offered rather
   * than none — the API is the authority either way.
   */
  const selectableCuves = cuves.filter(
    (cuve) =>
      cuve.status === 'active' && (!loadedItem?.id || cuve.item?.id === loadedItem.id),
  )
  const chosenCuve = selectableCuves.find((cuve) => cuve.id === cuveId)

  /** More than the load still owes is a mistake worth catching before sending. */
  const exceedsRemaining =
    Number.isFinite(receivedQty) &&
    receivedQty > 0 &&
    Number.isFinite(remaining) &&
    remaining > 0 &&
    receivedQty > remaining

  function onSubmit(values: ReceiveForm) {
    if (!order) return
    if (exceedsRemaining) {
      setError('receivedQty', {
        message: `Only ${formatQty(remaining)} is still to receive`,
      })
      return
    }

    receiveOrder.mutate(
      {
        id: order.id,
        cuveId: values.cuveId,
        // A number, not the string the documented body shows.
        receivedQty: Number(values.receivedQty),
      },
      {
        onSuccess: () => {
          toast.success('Fuel received')
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
          // Covers the site-manager refusal, which arrives as a plain message
          // rather than field details.
          toast.error(errorMessage(err))
        },
      },
    )
  }

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Receive into a cuve"
      description={
        order
          ? `${order.dVehicle?.vechile?.platNumber ?? 'Load'} — ${formatQty(
              order.totalQuantity,
            )}${unitCode ? ` ${unitCode}` : ''} loaded`
          : ''
      }
    >
      <form onSubmit={handleSubmit(onSubmit)} className="grid gap-4">
        {/* What the load is carrying and what it still owes, so the figure
            below is entered against something rather than from memory. */}
        {order && (
          <div className="flex flex-wrap items-baseline justify-between gap-3 rounded-md border bg-muted/40 px-3 py-2">
            <div>
              <span className="text-xs text-muted-foreground">Product</span>
              <p className="text-sm font-medium">{loadedItem?.name ?? '—'}</p>
            </div>
            <div className="text-right">
              <span className="text-xs text-muted-foreground">Still to receive</span>
              <p className="text-sm font-medium tabular-nums">
                {formatQty(remaining)}
                {unitCode ? ` ${unitCode}` : ''}
              </p>
              {Number(order.receivedQuantity) > 0 && (
                <p className="text-xs text-muted-foreground">
                  {formatQty(order.receivedQuantity)} already received
                </p>
              )}
            </div>
          </div>
        )}

        <div className="grid gap-1.5">
          <Label htmlFor="cuveId">Cuve</Label>
          <Select
            value={cuveId}
            onValueChange={(value) => setValue('cuveId', value, { shouldValidate: true })}
          >
            <SelectTrigger id="cuveId">
              <SelectValue placeholder="Select a cuve" />
            </SelectTrigger>
            <SelectContent>
              {selectableCuves.map((cuve) => (
                <SelectItem key={cuve.id} value={cuve.id}>
                  {cuve.name}
                  {cuve.site?.name ? ` · ${cuve.site.name}` : ''}
                  {cuve.item?.name ? ` · ${cuve.item.name}` : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {errors.cuveId ? (
            <p className="text-sm text-destructive">{errors.cuveId.message}</p>
          ) : selectableCuves.length === 0 ? (
            // Naming the reason: cuves may well exist, just none for this fuel.
            <p className="text-xs text-muted-foreground">
              No active cuve holds {loadedItem?.name ?? 'this product'}.
            </p>
          ) : (
            loadedItem?.name && (
              <p className="text-xs text-muted-foreground">
                Only cuves holding {loadedItem.name} are listed.
              </p>
            )
          )}
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="receivedQty">
            Received quantity
            {unitCode && (
              <span className="ml-1 font-normal text-muted-foreground">({unitCode})</span>
            )}
          </Label>
          <Input
            id="receivedQty"
            type="number"
            min="0"
            step="any"
            max={Number.isFinite(remaining) && remaining > 0 ? remaining : undefined}
            placeholder={Number.isFinite(remaining) && remaining > 0 ? String(remaining) : ''}
            {...register('receivedQty')}
          />
          {errors.receivedQty ? (
            <p className="text-sm text-destructive">{errors.receivedQty.message}</p>
          ) : exceedsRemaining ? (
            <p className="text-sm text-destructive">
              Only {formatQty(remaining)}
              {unitCode ? ` ${unitCode}` : ''} is still to receive
            </p>
          ) : chosenCuve ? (
            <p className="text-xs text-muted-foreground">
              Into {chosenCuve.name}
              {chosenCuve.maximum ? `, which holds up to ${formatQty(chosenCuve.maximum)}` : ''}
              {unitCode && chosenCuve.maximum ? ` ${unitCode}` : ''}
            </p>
          ) : null}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" disabled={receiveOrder.isPending || exceedsRemaining}>
            {receiveOrder.isPending ? 'Receiving…' : 'Receive'}
          </Button>
        </DialogFooter>
      </form>
    </FormDialog>
  )
}
