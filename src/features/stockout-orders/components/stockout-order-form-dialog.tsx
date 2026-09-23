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
import { errorMessage, errorStatus, fieldErrors } from '@/lib/error-message'
import { useCreateStockoutOrder } from '@/features/stockout-orders/use-stockout-orders'
import { ItemCascadeSelect } from '@/features/items/components/item-cascade-select'
import { useItems } from '@/features/items/use-items'
import { useUnits } from '@/features/units/use-units'
import { useSites } from '@/features/pss/use-pss'
import { useSiteScope } from '@/hooks/use-site-scope'
import { STOCKOUT_ORDER_TYPES, type StockoutOrderType } from '@/api/types'

const NONE = '__none__'

const schema = z
  .object({
    itemId: z.string().min(1, 'Choose an item'),
    // Kept as strings for the inputs, coerced on submit.
    quantity: z
      .string()
      .min(1, 'Quantity is required')
      .refine((v) => Number(v) > 0, 'Must be greater than 0'),
    unitPrice: z
      .string()
      .min(1, 'Unit price is required')
      // The API allows 0; only negative is rejected.
      .refine((v) => Number(v) >= 0, 'Cannot be negative'),
    orderType: z.enum(['internal', 'b2b']),
    siteId: z.string(),
  })
  // Mirrors the API's own rule: `siteId is required when orderType is internal`.
  // A `b2b` order goes to a buyer, not to one of our sites.
  .refine((v) => v.orderType !== 'internal' || v.siteId !== '', {
    path: ['siteId'],
    message: 'A site is required for an internal order',
  })

type StockoutOrderForm = z.infer<typeof schema>

const emptyValues: StockoutOrderForm = {
  itemId: '',
  quantity: '',
  unitPrice: '',
  orderType: 'internal',
  siteId: '',
}

/** Labels the two order types without exposing the raw codes. */
const ORDER_TYPE_LABELS: Record<StockoutOrderType, string> = {
  internal: 'Internal — out to one of our sites',
  b2b: 'B2B — sold to another business',
}

/**
 * Which pool each type draws on — the two are **different**, confirmed live.
 * A B2B sale passes stock on before it is cleared; moving stock to one of our
 * own sites requires clearance first.
 */
const ORDER_TYPE_POOL: Record<StockoutOrderType, string> = {
  internal: 'Draws on cleared stock.',
  b2b: 'Draws on uncleared stock.',
}

const FIELD_NAMES = ['itemId', 'quantity', 'unitPrice', 'orderType', 'siteId'] as const

/**
 * Create only — the API exposes no update or delete for stockout orders.
 */
export function StockoutOrderFormDialog({
  open,
  onOpenChange,
  canReadItems,
  canReadUnits,
  canReadSites,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Gated on `items.read`, not the stockout permission. */
  canReadItems: boolean
  /** Gated on `units.read` — only used to label the quantity. */
  canReadUnits: boolean
  /** Gated on `pss.read` — sites are the PSS module. */
  canReadSites: boolean
}) {
  const createOrder = useCreateStockoutOrder()
  const { rows: itemRows } = useItems({ enabled: canReadItems })
  const { units } = useUnits({ enabled: canReadUnits })
  const { sites: allSites } = useSites({ enabled: canReadSites })
  /**
   * A superAdmin may choose any site; anyone else is limited to their own
   * assignments, which the session already carries.
   */
  const { isSuperAdmin, sites: scopedSites, isSingleSite, onlySiteId } =
    useSiteScope(allSites)

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    setError,
    watch,
    formState: { errors },
  } = useForm<StockoutOrderForm>({ resolver: zodResolver(schema), defaultValues: emptyValues })

  const itemId = watch('itemId')
  const siteId = watch('siteId')
  const orderType = watch('orderType')
  /** Only an internal order goes to one of our sites. */
  const needsSite = orderType === 'internal'

  /** An inactive site is not a valid place to sell from. */
  const selectableSites = scopedSites.filter((s) => s.status === 'active' || s.id === siteId)

  /** The chosen item's unit, so quantity and price are not bare numbers. */
  const chosenItem = itemRows.find((r) => r.id === itemId)
  const unitCode = units.find((u) => u.id === chosenItem?.baseUnitId)?.code ?? ''

  /**
   * What the order comes to. Shown rather than sent: the API takes a unit price
   * and does its own arithmetic, so submitting a total would risk the two
   * disagreeing.
   */
  const quantity = Number(watch('quantity'))
  const unitPrice = Number(watch('unitPrice'))
  const total =
    Number.isFinite(quantity) && Number.isFinite(unitPrice) && quantity > 0 && unitPrice > 0
      ? quantity * unitPrice
      : null

  useEffect(() => {
    if (!open) return
    // With exactly one site there is no decision to make, so it is chosen for
    // the user rather than left as an empty control they must still operate.
    reset({ ...emptyValues, siteId: onlySiteId ?? '' })
  }, [open, onlySiteId, reset])

  function onSubmit(values: StockoutOrderForm) {
    createOrder.mutate(
      {
        itemId: values.itemId,
        quantity: Number(values.quantity),
        unitPrice: Number(values.unitPrice),
        orderType: values.orderType,
        // Omitted entirely when blank, and never sent for a b2b order — the API
        // validates it as a UUID whenever the key is present.
        ...(needsSite && values.siteId ? { siteId: values.siteId } : {}),
      },
      {
        onSuccess: () => {
          toast.success('Stockout order created')
          onOpenChange(false)
        },
        onError: (err) => {
          // A stockout draws on cleared stock; the ceiling arrives as a 422
          // with a plain message, so it is attached to the quantity field.
          if (errorStatus(err) === 422) {
            setError('quantity', { message: errorMessage(err) })
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
      title="New stockout order"
      description="Stock sold out from a site at an agreed unit price."
    >
      <form onSubmit={handleSubmit(onSubmit)} className="grid gap-4">
        {/* The same three-level Class → Item → Category picker the Items page
            uses, so an item means the same thing in both places. */}
        <ItemCascadeSelect
          rows={itemRows}
          value={itemId}
          onChange={(id) => setValue('itemId', id, { shouldValidate: true })}
          error={errors.itemId?.message}
        />

        <div className="grid gap-1.5">
          <Label htmlFor="orderType">Order type</Label>
          <Select
            value={orderType}
            onValueChange={(v) =>
              setValue('orderType', v as StockoutOrderType, { shouldValidate: true })
            }
          >
            <SelectTrigger id="orderType">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STOCKOUT_ORDER_TYPES.map((value) => (
                <SelectItem key={value} value={value}>
                  {ORDER_TYPE_LABELS[value]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {errors.orderType ? (
            <p className="text-sm text-destructive">{errors.orderType.message}</p>
          ) : (
            // Says which pool the quantity will be checked against, so a
            // refusal is not a surprise.
            <p className="text-xs text-muted-foreground">{ORDER_TYPE_POOL[orderType]}</p>
          )}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label htmlFor="quantity">
              Quantity
              {unitCode && (
                <span className="ml-1 font-normal text-muted-foreground">({unitCode})</span>
              )}
            </Label>
            <Input
              id="quantity"
              type="number"
              min="0"
              step="any"
              placeholder="200"
              {...register('quantity')}
            />
            {errors.quantity && (
              <p className="text-sm text-destructive">{errors.quantity.message}</p>
            )}
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="unitPrice">
              Unit price
              {unitCode && (
                <span className="ml-1 font-normal text-muted-foreground">(per {unitCode})</span>
              )}
            </Label>
            <Input
              id="unitPrice"
              type="number"
              min="0"
              step="any"
              placeholder="1700"
              {...register('unitPrice')}
            />
            {errors.unitPrice && (
              <p className="text-sm text-destructive">{errors.unitPrice.message}</p>
            )}
          </div>
        </div>

        {/* The arithmetic is shown, not sent — a wrong quantity or price is
            visible in the figure it produces. */}
        {total !== null && (
          <div className="flex items-baseline justify-between rounded-md border bg-muted/40 px-3 py-2">
            <span className="text-xs text-muted-foreground">
              {quantity.toLocaleString()}
              {unitCode ? ` ${unitCode}` : ''} × {unitPrice.toLocaleString()}
            </span>
            <span className="text-sm font-medium tabular-nums">{total.toLocaleString()}</span>
          </div>
        )}

        {/* Only an internal order goes to one of our sites — the API rejects a
            site-less internal order and needs none for b2b. */}
        {needsSite && (
        <div className="grid gap-1.5">
          <Label htmlFor="siteId">Site</Label>
          <Select
            value={siteId || NONE}
            // With exactly one site there is nothing to choose between, so the
            // control is locked rather than presented as a decision.
            disabled={isSingleSite}
            onValueChange={(v) => setValue('siteId', v === NONE ? '' : v, { shouldValidate: true })}
          >
            <SelectTrigger id="siteId">
              <SelectValue placeholder="No site" />
            </SelectTrigger>
            <SelectContent>
              {/* No "No site" option: this block only renders for an internal
                  order, which the API requires a site for. */}
              {selectableSites.map((site) => (
                <SelectItem key={site.id} value={site.id}>
                  {site.name}
                  {site.address ? ` — ${site.address}` : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {errors.siteId ? (
            <p className="text-sm text-destructive">{errors.siteId.message}</p>
          ) : isSingleSite ? (
            <p className="text-xs text-muted-foreground">Your assigned site.</p>
          ) : isSuperAdmin ? (
            <p className="text-xs text-muted-foreground">Required for an internal order.</p>
          ) : selectableSites.length === 0 ? (
            // Not a fault: the user simply has no site to sell from, and saying
            // so is more useful than an empty dropdown.
            <p className="text-xs text-muted-foreground">
              You are not assigned to any site.
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">Limited to your assigned sites.</p>
          )}
        </div>

        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" disabled={createOrder.isPending}>
            {createOrder.isPending ? 'Creating…' : 'Create order'}
          </Button>
        </DialogFooter>
      </form>
    </FormDialog>
  )
}
