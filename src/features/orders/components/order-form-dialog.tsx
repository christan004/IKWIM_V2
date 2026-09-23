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
import { useOrder, useSaveOrder } from '@/features/orders/use-orders'
import { useOrderPlans } from '@/features/orders/use-order-plans'
import { useSuppliers } from '@/features/suppliers/use-suppliers'
import { useItems } from '@/features/items/use-items'
import { ItemCascadeSelect } from '@/features/items/components/item-cascade-select'

const schema = z.object({
  supplierId: z.string().min(1, 'Choose a supplier'),
  itemId: z.string().min(1, 'Choose an item'),
  orderPlanId: z.string().min(1, 'Choose an order plan'),
  orderDate: z.string().min(1, 'Order date is required'),
  quantity: z
    .string()
    .min(1, 'Quantity is required')
    .refine((v) => Number(v) > 0, 'Must be greater than 0'),
})

type OrderForm = z.infer<typeof schema>

const emptyValues: OrderForm = {
  supplierId: '',
  itemId: '',
  orderPlanId: '',
  orderDate: '',
  quantity: '',
}

/** `<input type="date">` gives `YYYY-MM-DD`; the API wants a full ISO instant. */
function toIso(date: string): string {
  return new Date(`${date}T00:00:00Z`).toISOString()
}

/** ISO instant back to `YYYY-MM-DD`, sliced so the UTC day never shifts. */
function toDateInput(iso: string | undefined): string {
  return iso ? iso.slice(0, 10) : ''
}

const FIELD_NAMES = ['supplierId', 'itemId', 'orderPlanId', 'orderDate', 'quantity'] as const

export function OrderFormDialog({
  open,
  onOpenChange,
  orderId,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /**
   * Present when editing. The list rows carry no foreign keys, so the form
   * fetches `GET /orders/:id` to seed itself rather than being handed a row.
   */
  orderId?: string | null
}) {
  const saveOrder = useSaveOrder()
  const isEdit = Boolean(orderId)
  const { order, isLoading: orderLoading } = useOrder(open ? (orderId ?? undefined) : undefined)

  // Only options the user can actually order against are offered.
  const { suppliers } = useSuppliers()
  const { rows: items } = useItems()
  const { plans } = useOrderPlans()

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    setError,
    watch,
    formState: { errors },
  } = useForm<OrderForm>({ resolver: zodResolver(schema), defaultValues: emptyValues })

  const supplierId = watch('supplierId')
  const itemId = watch('itemId')
  const orderPlanId = watch('orderPlanId')

  /**
   * An inactive supplier or closed plan stays selectable on the order that
   * already uses it, so editing an old order does not silently re-point it.
   *
   * The **currently selected id** is included as well, not just the fetched
   * order's. Radix renders a Select's label by matching its `value` against a
   * mounted `SelectItem`; if the option is missing for even one render — which
   * happens between the form seeding itself and the record arriving — the
   * trigger falls back to the placeholder and the field looks empty.
   */
  const activeSuppliers = suppliers.filter(
    (s) => s.status === 'active' || s.id === order?.supplierId || s.id === supplierId,
  )
  const openPlans = plans.filter(
    (p) => p.status === 'active' || p.id === order?.orderPlanId || p.id === orderPlanId,
  )

  useEffect(() => {
    if (!open) return
    reset(
      order
        ? {
            supplierId: order.supplierId,
            itemId: order.itemId,
            orderPlanId: order.orderPlanId,
            orderDate: toDateInput(order.orderDate),
            // `quantity` arrives as a string from the API.
            quantity: String(order.quantity),
          }
        : emptyValues,
    )
  }, [open, order, reset])

  function onSubmit(values: OrderForm) {
    saveOrder.mutate(
      {
        id: orderId ?? undefined,
        supplierId: values.supplierId,
        itemId: values.itemId,
        orderPlanId: values.orderPlanId,
        orderDate: toIso(values.orderDate),
        quantity: Number(values.quantity),
        // `createdByUserId` is deliberately omitted — the API derives the
        // creator from the access token and rejects the field.
      },
      {
        onSuccess: () => {
          toast.success(isEdit ? 'Order updated' : 'Order created')
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
      title={isEdit ? 'Edit order' : 'New order'}
      description="An order for one item from one supplier, inside an order plan."
    >
      <form onSubmit={handleSubmit(onSubmit)} className="grid gap-4">
        <div className="grid gap-1.5">
          <Label htmlFor="orderPlanId">Order plan</Label>
          <Select
            value={orderPlanId}
            onValueChange={(v) => setValue('orderPlanId', v, { shouldValidate: true })}
          >
            <SelectTrigger id="orderPlanId">
              <SelectValue placeholder="Select a plan" />
            </SelectTrigger>
            <SelectContent>
              {openPlans.map((plan) => (
                <SelectItem key={plan.id} value={plan.id}>
                  {plan.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {errors.orderPlanId ? (
            <p className="text-sm text-destructive">{errors.orderPlanId.message}</p>
          ) : (
            <p className="text-xs text-muted-foreground">Only active plans are listed.</p>
          )}
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="supplierId">Supplier</Label>
          <Select
            value={supplierId}
            onValueChange={(v) => setValue('supplierId', v, { shouldValidate: true })}
          >
            <SelectTrigger id="supplierId">
              <SelectValue placeholder="Select a supplier" />
            </SelectTrigger>
            <SelectContent>
              {activeSuppliers.map((supplier) => (
                <SelectItem key={supplier.id} value={supplier.id}>
                  {supplier.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {errors.supplierId && (
            <p className="text-sm text-destructive">{errors.supplierId.message}</p>
          )}
        </div>

        {/* Items nest three deep — Class > Item > Category — and only the leaf
            is ordered against, so the levels are chosen in sequence. */}
        <ItemCascadeSelect
          rows={items}
          value={itemId}
          onChange={(id) => setValue('itemId', id, { shouldValidate: true })}
          error={errors.itemId?.message}
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label htmlFor="orderDate">Order date</Label>
            <Input id="orderDate" type="date" {...register('orderDate')} />
            {errors.orderDate && (
              <p className="text-sm text-destructive">{errors.orderDate.message}</p>
            )}
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="quantity">Quantity</Label>
            <Input
              id="quantity"
              type="number"
              min="0"
              step="any"
              placeholder="1000"
              {...register('quantity')}
            />
            {errors.quantity && (
              <p className="text-sm text-destructive">{errors.quantity.message}</p>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          {/* Saving before the detail arrives would submit an empty form over
              the existing order. */}
          <Button type="submit" disabled={saveOrder.isPending || orderLoading}>
            {saveOrder.isPending
              ? isEdit
                ? 'Saving…'
                : 'Creating…'
              : isEdit
                ? 'Save changes'
                : 'Create order'}
          </Button>
        </DialogFooter>
      </form>
    </FormDialog>
  )
}
