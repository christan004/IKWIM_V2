import { useEffect, useRef, useState } from 'react'
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
import { useClearCentralStock } from '@/features/central-stock/use-central-stock'
import { useClearanceAgents } from '@/features/clearance-agents/use-clearance-agents'
import { CLEARANCE_TYPES, type CentralStockGroup } from '@/api/types'

/** Sentinel for "no agent" — Radix Select cannot hold an empty string. */
const NONE = '__none__'

const schema = z
  .object({
    /**
     * Newly required by the API, and the discriminant: `fifo` lets it choose
     * the oldest uncleared receipts, `manual` clears one named receipt.
     */
    type: z.enum(CLEARANCE_TYPES),
    /** Only meaningful — and only required — when the type is `manual`. */
    centralStockId: z.string(),
    // Kept as strings for the inputs, coerced on submit.
    quantity: z
      .string()
      .min(1, 'Quantity is required')
      .refine((v) => Number(v) > 0, 'Must be greater than 0'),
    // Optional on the API, so blank is allowed and simply omitted.
    fees: z.string().refine((v) => v === '' || Number(v) >= 0, 'Cannot be negative'),
    amount: z.string().refine((v) => v === '' || Number(v) >= 0, 'Cannot be negative'),
    agentId: z.string(),
  })
  // The API reports this as a root-level error rather than against the field,
  // so it is checked here to land on the picker the user can actually fix.
  .refine((v) => v.type !== 'manual' || v.centralStockId !== '', {
    message: 'Choose the receipt to clear',
    path: ['centralStockId'],
  })

type ClearanceForm = z.infer<typeof schema>

const emptyValues: ClearanceForm = {
  // FIFO is the safe default: it needs no receipt chosen and matches how the
  // endpoint behaved before `type` existed.
  type: 'fifo',
  centralStockId: '',
  quantity: '',
  fees: '',
  amount: '',
  agentId: '',
}

const FIELD_NAMES = ['type', 'centralStockId', 'quantity', 'fees', 'amount', 'agentId'] as const

/**
 * Clears one item's stock through customs.
 *
 * Raised **per item**, not per receipt: the API pools the item's uncleared
 * stock, so the dialog takes the whole group rather than a single record.
 */
export function ClearanceDialog({
  open,
  onOpenChange,
  group,
  canReadAgents,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** The item being cleared. `null` closes the dialog. */
  group: CentralStockGroup | null
  /** Gated on `clearance.agent.read`, not the central-stock permission. */
  canReadAgents: boolean
}) {
  const clearStock = useClearCentralStock()
  const { agents } = useClearanceAgents({ enabled: canReadAgents })

  const [dmsDoc, setDmsDoc] = useState<File | null>(null)

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    setError,
    watch,
    getValues,
    formState: { errors },
  } = useForm<ClearanceForm>({ resolver: zodResolver(schema), defaultValues: emptyValues })

  const quantity = Number(watch('quantity'))
  const agentId = watch('agentId')
  const feesValue = watch('fees')
  const clearanceType = watch('type')
  const centralStockId = watch('centralStockId')

  /**
   * The receipts a manual clearance can name — only those with stock still
   * uncleared, since clearing a fully cleared receipt is a no-op the API would
   * reject anyway.
   */
  const clearableReceipts = (group?.stocks ?? []).filter(
    (stock) => Number(stock.unclearedQuantity ?? stock.remainingQuantity) > 0,
  )
  const chosenReceipt = clearableReceipts.find((stock) => stock.id === centralStockId)

  /**
   * The fee this dialog last filled in for the user.
   *
   * Auto-fill must not overwrite a figure the user typed themselves, so the
   * field is only replaced while it still holds what we put there — the same
   * guard the PFI amount uses.
   */
  const lastFilledFee = useRef<string | null>(null)

  useEffect(() => {
    if (!open) return
    reset(emptyValues)
    setDmsDoc(null)
    lastFilledFee.current = null
  }, [open, reset])

  /**
   * Selecting an agent fills in their fee.
   *
   * Confirmed against live data: the one existing clearance has `fees: 1200`
   * against an agent whose own fee is `1200` — so the agent's fee **is** the
   * clearance fee, not merely a suggestion. It stays editable because a
   * one-off negotiation should still be possible.
   */
  useEffect(() => {
    if (!open) return
    const agentFee = agents.find((a) => a.id === agentId)?.fees
    if (agentFee === undefined) return

    const current = getValues('fees')
    // Only fill a blank field, or one still holding our own last value.
    if (current !== '' && current !== lastFilledFee.current) return

    const next = String(agentFee)
    lastFilledFee.current = next
    setValue('fees', next, { shouldValidate: true })
  }, [open, agentId, agents, getValues, setValue])

  const unitCode = group?.item?.baseUnit?.code ?? ''

  /**
   * The ceiling the API enforces. It refuses anything larger with `422` and
   * `Only <n> uncleared stock is available`, so the same bound is applied here
   * to catch it before sending.
   */
  const itemUncleared = Number(
    group?.summary?.unclearedQuantity ?? group?.summary?.remainingQuantity,
  )
  /*
   * A manual clearance draws on one receipt, so that receipt's own uncleared
   * figure is the real ceiling — always at or below the item's pooled total.
   * FIFO draws on the pool, so the group figure applies.
   */
  const uncleared =
    clearanceType === 'manual' && chosenReceipt
      ? Number(chosenReceipt.unclearedQuantity ?? chosenReceipt.remainingQuantity)
      : itemUncleared
  const exceedsUncleared =
    Number.isFinite(uncleared) && Number.isFinite(quantity) && quantity > uncleared

  /** Only active agents can be chosen; an inactive one stays visible if set. */
  const selectableAgents = agents.filter((a) => a.status === 'active' || a.id === agentId)
  const chosenAgent = agents.find((a) => a.id === agentId)

  function onSubmit(values: ClearanceForm) {
    if (!group?.item?.id) return
    if (exceedsUncleared) {
      setError('quantity', {
        message: `Only ${uncleared.toLocaleString()} uncleared stock is available`,
      })
      return
    }

    const common = {
      itemId: group.item.id,
      quantity: Number(values.quantity),
      // Omitted entirely when blank — each is validated when present.
      ...(values.fees !== '' ? { fees: Number(values.fees) } : {}),
      ...(values.amount !== '' ? { amount: Number(values.amount) } : {}),
      ...(values.agentId ? { agentId: values.agentId } : {}),
      ...(dmsDoc ? { dmsDoc } : {}),
    }

    clearStock.mutate(
      // A discriminated union: `centralStockId` belongs only to `manual`, so
      // the two branches are built separately rather than spreading a key the
      // `fifo` shape forbids.
      values.type === 'manual'
        ? { ...common, type: 'manual' as const, centralStockId: values.centralStockId }
        : { ...common, type: 'fifo' as const },
      {
        onSuccess: () => {
          toast.success('Stock cleared')
          onOpenChange(false)
        },
        onError: (err) => {
          // The quantity ceiling comes back as a 422 with a plain message
          // rather than field details, so it is attached to the field it is
          // actually about.
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
      title="Clear stock"
      description="Clear this item's stock through customs."
    >
      <form onSubmit={handleSubmit(onSubmit)} className="grid gap-4">
        {/* Read-only: the item is chosen by the row the action came from. */}
        <div className="rounded-md border bg-muted/40 px-3 py-2">
          {group ? (
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <div>
                <span className="text-xs text-muted-foreground">Item</span>
                <p className="text-sm font-medium">{group.item?.name ?? '—'}</p>
              </div>
              <div className="text-right">
                {/* Which figure this is depends on the method: a manual
                    clearance is bounded by the chosen receipt, not the item. */}
                <span className="text-xs text-muted-foreground">
                  {clearanceType === 'manual' && chosenReceipt
                    ? 'Uncleared on this receipt'
                    : 'Uncleared'}
                </span>
                {/* The figure the API bounds the request by, so it leads. */}
                <p className="text-sm font-medium tabular-nums">
                  {Number.isFinite(uncleared) ? uncleared.toLocaleString() : '—'}
                  {unitCode && (
                    <span className="ml-1 text-xs font-normal text-muted-foreground">
                      {unitCode}
                    </span>
                  )}
                </p>
                {Number(group.summary?.clearedQuantity) > 0 && (
                  <p className="text-xs text-muted-foreground">
                    {Number(group.summary?.clearedQuantity).toLocaleString()} already cleared
                  </p>
                )}
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No item selected.</p>
          )}
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="type">Clearance method</Label>
          <Select
            value={clearanceType}
            onValueChange={(v) => {
              setValue('type', v as ClearanceForm['type'], { shouldValidate: true })
              // A receipt only belongs to a manual clearance; leaving a stale
              // one set would send it back the next time manual is chosen.
              if (v !== 'manual') setValue('centralStockId', '')
            }}
          >
            <SelectTrigger id="type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="fifo">FIFO — clear the oldest receipts first</SelectItem>
              <SelectItem value="manual">Manual — clear one chosen receipt</SelectItem>
            </SelectContent>
          </Select>
          {errors.type && <p className="text-sm text-destructive">{errors.type.message}</p>}
        </div>

        {clearanceType === 'manual' && (
          <div className="grid gap-1.5">
            <Label htmlFor="centralStockId">Receipt</Label>
            <Select
              value={centralStockId}
              onValueChange={(v) => setValue('centralStockId', v, { shouldValidate: true })}
            >
              <SelectTrigger id="centralStockId">
                <SelectValue placeholder="Select a receipt" />
              </SelectTrigger>
              <SelectContent>
                {clearableReceipts.map((stock) => {
                  const left = Number(stock.unclearedQuantity ?? stock.remainingQuantity)
                  return (
                    <SelectItem key={stock.id} value={stock.id}>
                      {/* The exporting country and depot are what tell two
                          receipts of the same item apart. */}
                      {stock.t1Validation?.exportingCountry ?? 'Receipt'}
                      {stock.depot?.name ? ` · ${stock.depot.name}` : ''}
                      {Number.isFinite(left) ? ` — ${left.toLocaleString()} uncleared` : ''}
                    </SelectItem>
                  )
                })}
              </SelectContent>
            </Select>
            {errors.centralStockId ? (
              <p className="text-sm text-destructive">{errors.centralStockId.message}</p>
            ) : (
              clearableReceipts.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  No receipt of this item has stock left to clear.
                </p>
              )
            )}
          </div>
        )}

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
            placeholder="5000"
            {...register('quantity')}
          />
          {errors.quantity ? (
            <p className="text-sm text-destructive">{errors.quantity.message}</p>
          ) : exceedsUncleared ? (
            <p className="text-sm text-destructive">
              Only {uncleared.toLocaleString()} uncleared stock is available.
            </p>
          ) : (
            quantity > 0 && (
              <p className="text-xs text-muted-foreground">
                {(uncleared - quantity).toLocaleString()}
                {unitCode ? ` ${unitCode}` : ''} would remain uncleared.
              </p>
            )
          )}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label htmlFor="fees">Fees</Label>
            <Input id="fees" type="number" min="0" step="any" placeholder="100" {...register('fees')} />
            {errors.fees ? (
              <p className="text-sm text-destructive">{errors.fees.message}</p>
            ) : chosenAgent ? (
              // Says where the number came from, and that it can be overridden.
              <p className="text-xs text-muted-foreground">
                {feesValue === String(chosenAgent.fees)
                  ? `${chosenAgent.names}'s fee. Edit to override.`
                  : `${chosenAgent.names} usually charges ${Number(
                      chosenAgent.fees,
                    ).toLocaleString()}.`}
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">Optional — or pick an agent below.</p>
            )}
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="amount">Amount</Label>
            <Input
              id="amount"
              type="number"
              min="0"
              step="any"
              placeholder="2500"
              {...register('amount')}
            />
            {errors.amount ? (
              <p className="text-sm text-destructive">{errors.amount.message}</p>
            ) : (
              // Deliberately not computed. The one live clearance has
              // quantity 150, fees 1,200 and amount 50,000 — which is neither
              // quantity x fees (180,000) nor any clean multiple, so there is
              // no formula to apply. Guessing would put a wrong figure on screen.
              <p className="text-xs text-muted-foreground">Optional — entered, not calculated.</p>
            )}
          </div>
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="agentId">Clearing agent</Label>
          <Select
            value={agentId || NONE}
            onValueChange={(v) => setValue('agentId', v === NONE ? '' : v, { shouldValidate: true })}
          >
            <SelectTrigger id="agentId">
              <SelectValue placeholder="No agent" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>No agent</SelectItem>
              {selectableAgents.map((agent) => (
                <SelectItem key={agent.id} value={agent.id}>
                  {agent.names}
                  {/* The agent's own fee, so the figure above can be checked
                      against what they normally charge. */}
                  {agent.fees !== undefined && ` — ${Number(agent.fees).toLocaleString()}`}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {errors.agentId ? (
            <p className="text-sm text-destructive">{errors.agentId.message}</p>
          ) : chosenAgent ? (
            <p className="text-xs text-muted-foreground">
              Usual fee {Number(chosenAgent.fees).toLocaleString()}.
            </p>
          ) : !canReadAgents ? (
            <p className="text-xs text-muted-foreground">
              You cannot view clearance agents, so this is left unset.
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">Optional.</p>
          )}
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="dmsDoc">DMS document</Label>
          {/* A real upload, despite the API field being named `…Url`. */}
          <Input
            id="dmsDoc"
            type="file"
            accept=".pdf,image/*"
            onChange={(event) => setDmsDoc(event.target.files?.[0] ?? null)}
          />
          <p className="text-xs text-muted-foreground">Optional.</p>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" disabled={clearStock.isPending || !group || exceedsUncleared}>
            {clearStock.isPending ? 'Clearing…' : 'Clear stock'}
          </Button>
        </DialogFooter>
      </form>
    </FormDialog>
  )
}
