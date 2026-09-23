import { useEffect } from 'react'
import { useFieldArray, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { Plus, Trash2 } from 'lucide-react'
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
import { errorMessage, errorStatus, fieldErrors } from '@/lib/error-message'
import { useCreateLoadingOrder } from '@/features/stockout-orders/use-stockout-orders'
import { useDrivers } from '@/features/drivers/use-drivers'
import { useVehicles } from '@/features/vehicles/use-vehicles'
import { cn } from '@/lib/utils'
import type { StockoutOrder } from '@/api/types'

const lineSchema = z.object({
  orderId: z.string().min(1, 'Choose an order'),
  // Kept as a string for the input, coerced on submit.
  quantity: z
    .string()
    .min(1, 'Quantity is required')
    .refine((v) => Number(v) > 0, 'Must be greater than zero'),
})

const schema = z
  .object({
    driverVehicleId: z.string().min(1, 'Choose a driver and vehicle'),
    lines: z.array(lineSchema).min(1, 'Add at least one order'),
  })
  .superRefine((values, ctx) => {
    // The API refuses a repeated order with a bare "invalid data" message, so
    // it is caught here where the offending row can be named.
    const seen = new Map<string, number>()
    values.lines.forEach((line, index) => {
      if (!line.orderId) return
      if (seen.has(line.orderId)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['lines', index, 'orderId'],
          message: 'This order is already on the list',
        })
      }
      seen.set(line.orderId, index)
    })
  })

type LoadingOrderForm = z.infer<typeof schema>

const emptyLine = { orderId: '', quantity: '' }
const emptyValues: LoadingOrderForm = { driverVehicleId: '', lines: [emptyLine] }

const FIELD_NAMES = ['driverVehicleId'] as const

/** What an order still has left to assign. */
function unassignedOf(order: StockoutOrder | undefined): number {
  // The list carries no explicit "unassigned" figure, so the order's own
  // quantity is the ceiling until one is loaded against it.
  return Number(order?.quantity)
}

/**
 * Assigns stockout orders to a vehicle for loading.
 *
 * Two ceilings apply — see `LoadingOrderRequest`. Both are checked here so a
 * doomed request is caught before sending, and both are re-reported from the
 * API's own `422` in case the figures moved.
 */
export function LoadingOrderDialog({
  open,
  onOpenChange,
  orders,
  canReadDrivers,
  canReadVehicles,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** The stockout orders available to load. */
  orders: StockoutOrder[]
  /** Gated on `drivers.read`, not the loading-orders permission. */
  canReadDrivers: boolean
  /** Gated on `vehicles.read` — the capacity lives there, not on the driver. */
  canReadVehicles: boolean
}) {
  const createLoadingOrder = useCreateLoadingOrder()
  const { drivers } = useDrivers({ enabled: canReadDrivers })
  const { vehicles } = useVehicles({ enabled: canReadVehicles })

  const {
    register,
    handleSubmit,
    reset,
    control,
    setValue,
    setError,
    watch,
    formState: { errors },
  } = useForm<LoadingOrderForm>({ resolver: zodResolver(schema), defaultValues: emptyValues })

  const { fields, append, remove } = useFieldArray({ control, name: 'lines' })

  const driverVehicleId = watch('driverVehicleId')
  const lines = watch('lines')

  useEffect(() => {
    if (!open) return
    reset(emptyValues)
  }, [open, reset])

  /**
   * The **assignment** id, not the vehicle's — the same field nominations
   * uses. A driver can hold several vehicles, so each pairing is one option.
   */
  const assignments = drivers.flatMap((driver) =>
    (driver.vehicles ?? []).map((assignment) => ({
      id: assignment.id,
      label: `${driver.names} · ${assignment.vechile.platNumber}`,
      /*
       * ⚠️ The nested `vechile` carries no `tankCapacity` — only id, plate,
       * model and status — so the capacity is joined from `/vehicles`, which
       * does have it. Without that join the vehicle ceiling could not be shown
       * before sending.
       */
      capacity: Number(
        vehicles.find((v) => v.id === assignment.vechile.id)?.tankCapacity,
      ),
      active: assignment.vechile.status === 'active',
    })),
  )
  const selectable = assignments.filter((a) => a.active || a.id === driverVehicleId)
  const chosen = assignments.find((a) => a.id === driverVehicleId)

  /** What this request would put on the vehicle, across every line. */
  const requested = lines.reduce((total, line) => {
    const quantity = Number(line.quantity)
    return Number.isFinite(quantity) ? total + quantity : total
  }, 0)

  const capacity = chosen?.capacity
  const overCapacity =
    Number.isFinite(capacity) && capacity !== undefined && requested > capacity

  function onSubmit(values: LoadingOrderForm) {
    // Checked here so the request is not sent to be refused — the API applies
    // the same ceiling across the whole array.
    if (overCapacity && capacity !== undefined) {
      setError('driverVehicleId', {
        message: `Vehicle capacity is ${capacity.toLocaleString()}; ${requested.toLocaleString()} was requested`,
      })
      return
    }

    createLoadingOrder.mutate(
      {
        driverVehicleId: values.driverVehicleId,
        orders: values.lines.map((line) => ({
          orderId: line.orderId,
          // A number, not a string — the API rejects a string.
          quantity: Number(line.quantity),
        })),
      },
      {
        onSuccess: () => {
          toast.success('Loading order created', {
            description: `${requested.toLocaleString()} assigned to ${chosen?.label ?? 'the vehicle'}.`,
          })
          onOpenChange(false)
        },
        onError: (err) => {
          // Both ceilings arrive as a 422 with a plain message rather than
          // field details, so they are surfaced where they can be acted on.
          if (errorStatus(err) === 422) {
            setError('driverVehicleId', { message: errorMessage(err) })
            return
          }

          const fieldMessages = fieldErrors(err)
          if (fieldMessages) {
            for (const name of FIELD_NAMES) {
              const message = fieldMessages[name]
              if (message) {
                setError(name, { message })
                return
              }
            }
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
      title="New loading order"
      description="Assign stockout orders to a vehicle for loading."
    >
      <form onSubmit={handleSubmit(onSubmit)} className="grid gap-4">
        <div className="grid gap-1.5">
          <Label htmlFor="driverVehicleId">Driver and vehicle</Label>
          <Select
            value={driverVehicleId}
            onValueChange={(v) => setValue('driverVehicleId', v, { shouldValidate: true })}
          >
            <SelectTrigger id="driverVehicleId">
              <SelectValue placeholder="Select a driver and vehicle" />
            </SelectTrigger>
            <SelectContent>
              {selectable.map((assignment) => (
                <SelectItem key={assignment.id} value={assignment.id}>
                  {assignment.label}
                  {Number.isFinite(assignment.capacity) && (
                    <span className="text-muted-foreground">
                      {' '}
                      · {assignment.capacity.toLocaleString()} capacity
                    </span>
                  )}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {errors.driverVehicleId ? (
            <p className="text-sm text-destructive">{errors.driverVehicleId.message}</p>
          ) : selectable.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              {canReadDrivers
                ? 'No driver has a vehicle assigned yet.'
                : 'You cannot read drivers.'}
            </p>
          ) : null}
        </div>

        <div className="grid gap-3 rounded-md border p-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Orders to load
              </p>
              <p className="text-xs text-muted-foreground">
                Each order can appear once.
              </p>
            </div>
            <Button type="button" variant="outline" size="sm" onClick={() => append(emptyLine)}>
              <Plus className="size-3.5" />
              Add order
            </Button>
          </div>

          {fields.map((field, index) => {
            const line = lines[index]
            const order = orders.find((o) => o.id === line?.orderId)
            const unassigned = unassignedOf(order)
            const quantity = Number(line?.quantity)
            // The API's per-order ceiling, applied before sending.
            const overOrder =
              Number.isFinite(unassigned) && Number.isFinite(quantity) && quantity > unassigned

            return (
              <div key={field.id} className="grid gap-2 rounded-md border bg-muted/30 p-2">
                <div className="flex items-end gap-2">
                  <div className="grid flex-1 gap-1">
                    <Label htmlFor={`order-${index}`} className="text-xs">
                      Order
                    </Label>
                    <Select
                      value={line?.orderId ?? ''}
                      onValueChange={(v) =>
                        setValue(`lines.${index}.orderId`, v, { shouldValidate: true })
                      }
                    >
                      <SelectTrigger id={`order-${index}`}>
                        <SelectValue placeholder="Select an order" />
                      </SelectTrigger>
                      <SelectContent>
                        {orders.map((option) => (
                          <SelectItem key={option.id} value={option.id}>
                            {option.centralStock?.item?.name ?? 'Order'}
                            <span className="text-muted-foreground">
                              {' '}
                              · {Number(option.quantity).toLocaleString()}
                              {option.site?.name ? ` · ${option.site.name}` : ''}
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="grid w-32 gap-1">
                    <Label htmlFor={`qty-${index}`} className="text-xs">
                      Quantity
                    </Label>
                    <Input
                      id={`qty-${index}`}
                      type="number"
                      min="0"
                      step="any"
                      placeholder="40"
                      {...register(`lines.${index}.quantity`)}
                    />
                  </div>

                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    // One line is the minimum the API accepts, so the last row
                    // cannot be removed.
                    disabled={fields.length === 1}
                    onClick={() => remove(index)}
                    title="Remove this order"
                  >
                    <Trash2 className="size-3.5 text-destructive" />
                  </Button>
                </div>

                {errors.lines?.[index]?.orderId ? (
                  <p className="text-sm text-destructive">
                    {errors.lines[index]?.orderId?.message}
                  </p>
                ) : errors.lines?.[index]?.quantity ? (
                  <p className="text-sm text-destructive">
                    {errors.lines[index]?.quantity?.message}
                  </p>
                ) : overOrder ? (
                  <p className="text-sm text-destructive">
                    Only {unassigned.toLocaleString()} unassigned on this order.
                  </p>
                ) : order ? (
                  <p className="text-xs text-muted-foreground">
                    {unassigned.toLocaleString()} available to assign.
                  </p>
                ) : null}
              </div>
            )
          })}

          {errors.lines?.message && (
            <p className="text-sm text-destructive">{errors.lines.message}</p>
          )}
        </div>

        {/* The load against the vehicle's capacity — the ceiling the API
            applies across the whole array, not per line. */}
        {requested > 0 && (
          <div
            className={cn(
              'flex items-baseline justify-between rounded-md border px-3 py-2',
              overCapacity ? 'border-destructive/40 bg-destructive/10' : 'bg-muted/40',
            )}
          >
            <span className="text-xs text-muted-foreground">
              {chosen ? `Load for ${chosen.label}` : 'Total to load'}
            </span>
            <span
              className={cn(
                'text-sm font-medium tabular-nums',
                overCapacity && 'text-destructive',
              )}
            >
              {requested.toLocaleString()}
              {Number.isFinite(capacity) && capacity !== undefined && (
                <span className="font-normal text-muted-foreground">
                  {' '}
                  of {capacity.toLocaleString()}
                </span>
              )}
            </span>
          </div>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" disabled={createLoadingOrder.isPending || overCapacity}>
            {createLoadingOrder.isPending ? 'Creating…' : 'Create loading order'}
          </Button>
        </DialogFooter>
      </form>
    </FormDialog>
  )
}
