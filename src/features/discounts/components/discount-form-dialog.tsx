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
import { errorMessage, fieldErrors } from '@/lib/error-message'
import { useSaveDiscount } from '@/features/discounts/use-discounts'
import { useClients } from '@/features/clients/use-clients'
import { useSites } from '@/features/pss/use-pss'
import { DISCOUNT_TYPES, type Discount, type DiscountType } from '@/api/types'

/** Sentinel for "no site" — Radix Select cannot hold an empty string. */
const NONE = '__none__'

/** `2026-09-01T00:00:00.000Z` → `2026-09-01`, for a date input. */
function toDateInput(iso: string | undefined): string {
  return iso ? iso.slice(0, 10) : ''
}

const tierSchema = z.object({
  from: z.string().refine((v) => Number.isFinite(Number(v)) && Number(v) >= 0, 'From must be 0 or more'),
  to: z.string().refine((v) => Number(v) > 0, 'To must be greater than zero'),
  amount: z.string().refine((v) => Number(v) > 0, 'Amount must be greater than zero'),
  siteId: z.string().min(1, 'Choose a site'),
})

const schema = z
  .object({
    type: z.enum(DISCOUNT_TYPES),
    // Kept as strings for the inputs, coerced on submit.
    value: z.string(),
    clientId: z.string(),
    siteId: z.string(),
    validFrom: z.string().min(1, 'Valid from is required'),
    validTo: z.string().min(1, 'Valid to is required'),
    status: z.enum(['active', 'inactive']),
    tiers: z.array(tierSchema),
  })
  .superRefine((values, ctx) => {
    const issue = (path: (string | number)[], message: string) =>
      ctx.addIssue({ code: z.ZodIssueCode.custom, path, message })

    // The API compares the two instants, not the calendar days.
    if (values.validFrom && values.validTo && values.validTo <= values.validFrom) {
      issue(['validTo'], 'Valid to must be later than valid from')
    }

    if (values.type === 'fixed') {
      if (values.clientId === '') issue(['clientId'], 'A fixed discount needs a client')
      if (Number(values.value) <= 0) issue(['value'], 'Discount value must be greater than zero')
      // At most 11 integer digits and 1 decimal place, per the API.
      if (values.value !== '' && !/^\d{1,11}(\.\d)?$/.test(values.value)) {
        issue(['value'], 'At most 11 digits and 1 decimal place')
      }
      return
    }

    // ranging
    if (values.tiers.length === 0) {
      issue(['tiers'], 'Add at least one tier')
      return
    }
    values.tiers.forEach((tier, index) => {
      if (Number(tier.to) <= Number(tier.from)) {
        issue(['tiers', index, 'to'], 'Range end must be greater than range start')
      }
    })
    // Mirrors the API's own rule, which reports it per tier.
    values.tiers.forEach((tier, index) => {
      const overlaps = values.tiers.some(
        (other, otherIndex) =>
          otherIndex < index &&
          other.siteId === tier.siteId &&
          Number(tier.from) < Number(other.to) &&
          Number(other.from) < Number(tier.to),
      )
      if (overlaps) issue(['tiers', index, 'from'], 'Ranges for the same site must not overlap')
    })
  })

type DiscountForm = z.infer<typeof schema>

const emptyTier = { from: '', to: '', amount: '', siteId: '' }

const emptyValues: DiscountForm = {
  type: 'fixed',
  value: '',
  clientId: '',
  siteId: '',
  validFrom: '',
  validTo: '',
  status: 'active',
  tiers: [],
}

const FIELD_NAMES = ['type', 'value', 'clientId', 'siteId', 'validFrom', 'validTo', 'status'] as const

const TYPE_LABELS: Record<DiscountType, string> = {
  fixed: 'Fixed — one rate for one client',
  ranging: 'Ranging — rates that change by volume',
}

export function DiscountFormDialog({
  open,
  onOpenChange,
  discount,
  canReadClients,
  canReadSites,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Present when editing; the list row carries every field, so no fetch. */
  discount?: Discount | null
  /** Gated on `clients.read`, not the discounts permission. */
  canReadClients: boolean
  /** Gated on `pss.read` — sites are the PSS module. */
  canReadSites: boolean
}) {
  const saveDiscount = useSaveDiscount()
  const { clients } = useClients({ enabled: canReadClients })
  const { sites } = useSites({ enabled: canReadSites })

  const {
    register,
    handleSubmit,
    reset,
    control,
    setValue,
    setError,
    watch,
    formState: { errors },
  } = useForm<DiscountForm>({ resolver: zodResolver(schema), defaultValues: emptyValues })

  const { fields, append, remove } = useFieldArray({ control, name: 'tiers' })

  const type = watch('type')
  const clientId = watch('clientId')
  const siteId = watch('siteId')
  const status = watch('status')

  const isRanging = type === 'ranging'

  useEffect(() => {
    if (!open) return
    reset(
      discount
        ? {
            type: discount.type,
            value: String(discount.value ?? ''),
            clientId: discount.clientId ?? '',
            siteId: discount.siteId ?? '',
            validFrom: toDateInput(discount.validFrom),
            validTo: toDateInput(discount.validTo),
            status: discount.status === 'inactive' ? 'inactive' : 'active',
            tiers: (discount.rangingDiscounts ?? []).map((tier) => ({
              from: String(tier.from),
              to: String(tier.to),
              amount: String(tier.amount),
              siteId: tier.siteId,
            })),
          }
        : emptyValues,
    )
  }, [open, discount, reset])

  /** Only a client admin owns an organisation, so only they can hold a discount. */
  const selectableClients = clients.filter(
    (c) => c.clientId && (c.position === 'clientAdmin' || c.id === clientId),
  )
  const activeSites = sites.filter((s) => s.status === 'active' || s.id === siteId)

  function onSubmit(values: DiscountForm) {
    const onError = (err: unknown) => {
      const fields_ = fieldErrors(err)
      if (fields_) {
        let matched = false
        for (const name of FIELD_NAMES) {
          const message = fields_[name]
          if (message) {
            setError(name, { message })
            matched = true
          }
        }
        if (matched) return
      }
      toast.error(errorMessage(err))
    }

    const onSuccess = () => {
      toast.success(discount ? 'Discount updated' : 'Discount created')
      onOpenChange(false)
    }

    // Dates go out as instants; the end covers the whole final day.
    const validFrom = `${values.validFrom}T00:00:00.000Z`
    const validTo = `${values.validTo}T23:59:59.000Z`
    const shared = { validFrom, validTo, status: values.status }
    const id = discount ? { id: discount.id } : {}

    // The two branches are built separately: a ranging body must NOT carry
    // `clientId` — the API rejects the key outright.
    saveDiscount.mutate(
      isRanging
        ? {
            ...id,
            type: 'ranging',
            // The tiers carry the real figures, so the top-level value is 0.
            value: 0,
            ...shared,
            ...(values.siteId ? { siteId: values.siteId } : {}),
            rangingDiscounts: values.tiers.map((tier) => ({
              from: Number(tier.from),
              to: Number(tier.to),
              amount: Number(tier.amount),
              siteId: tier.siteId,
              status: values.status,
            })),
          }
        : {
            ...id,
            type: 'fixed',
            value: Number(values.value),
            clientId: values.clientId,
            ...shared,
            ...(values.siteId ? { siteId: values.siteId } : {}),
          },
      { onSuccess, onError },
    )
  }

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={discount ? 'Edit discount' : 'New discount'}
      description="A fixed rate for one client, or rates that change with volume."
    >
      <form onSubmit={handleSubmit(onSubmit)} className="grid gap-4">
        <div className="grid gap-1.5">
          <Label htmlFor="type">Type</Label>
          <Select
            value={type}
            // Switching this on an existing record would change which branch it
            // belongs to, which the update endpoint cannot express.
            disabled={Boolean(discount)}
            onValueChange={(v) => setValue('type', v as DiscountType, { shouldValidate: true })}
          >
            <SelectTrigger id="type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DISCOUNT_TYPES.map((value) => (
                <SelectItem key={value} value={value}>
                  {TYPE_LABELS[value]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {errors.type && <p className="text-sm text-destructive">{errors.type.message}</p>}
        </div>

        {/* ---- the discriminated half ---- */}
        {isRanging ? (
          <div className="grid gap-3 rounded-md border p-3">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Volume tiers
                </p>
                <p className="text-xs text-muted-foreground">
                  Ranges for the same site must not overlap.
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => append(emptyTier)}
              >
                <Plus className="size-3.5" />
                Add tier
              </Button>
            </div>

            {fields.length === 0 ? (
              <p className="text-sm text-muted-foreground">No tiers yet — add at least one.</p>
            ) : (
              fields.map((field, index) => (
                <div key={field.id} className="grid gap-2 rounded-md border bg-muted/30 p-2">
                  <div className="grid gap-2 sm:grid-cols-3">
                    <div className="grid gap-1">
                      <Label htmlFor={`from-${index}`} className="text-xs">
                        From
                      </Label>
                      <Input
                        id={`from-${index}`}
                        type="number"
                        min="0"
                        step="any"
                        placeholder="0"
                        {...register(`tiers.${index}.from`)}
                      />
                    </div>
                    <div className="grid gap-1">
                      <Label htmlFor={`to-${index}`} className="text-xs">
                        To
                      </Label>
                      <Input
                        id={`to-${index}`}
                        type="number"
                        min="0"
                        step="any"
                        placeholder="100"
                        {...register(`tiers.${index}.to`)}
                      />
                    </div>
                    <div className="grid gap-1">
                      <Label htmlFor={`amount-${index}`} className="text-xs">
                        Discount
                      </Label>
                      <Input
                        id={`amount-${index}`}
                        type="number"
                        min="0"
                        step="any"
                        placeholder="2"
                        {...register(`tiers.${index}.amount`)}
                      />
                    </div>
                  </div>

                  <div className="flex items-end gap-2">
                    <div className="grid flex-1 gap-1">
                      <Label htmlFor={`site-${index}`} className="text-xs">
                        Site
                      </Label>
                      <Select
                        value={watch(`tiers.${index}.siteId`)}
                        onValueChange={(v) =>
                          setValue(`tiers.${index}.siteId`, v, { shouldValidate: true })
                        }
                      >
                        <SelectTrigger id={`site-${index}`}>
                          <SelectValue placeholder="Select a site" />
                        </SelectTrigger>
                        <SelectContent>
                          {activeSites.map((site) => (
                            <SelectItem key={site.id} value={site.id}>
                              {site.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => remove(index)}
                      title="Remove tier"
                    >
                      <Trash2 className="size-3.5 text-destructive" />
                    </Button>
                  </div>

                  {/* Each tier reports its own problems, so a bad row is
                      identifiable rather than only the group failing. */}
                  {(errors.tiers?.[index]?.from ||
                    errors.tiers?.[index]?.to ||
                    errors.tiers?.[index]?.amount ||
                    errors.tiers?.[index]?.siteId) && (
                    <p className="text-sm text-destructive">
                      {errors.tiers[index]?.from?.message ??
                        errors.tiers[index]?.to?.message ??
                        errors.tiers[index]?.amount?.message ??
                        errors.tiers[index]?.siteId?.message}
                    </p>
                  )}
                </div>
              ))
            )}
            {errors.tiers?.message && (
              <p className="text-sm text-destructive">{errors.tiers.message}</p>
            )}
          </div>
        ) : (
          <>
            <div className="grid gap-1.5">
              <Label htmlFor="clientId">Client</Label>
              <Select
                value={clientId}
                onValueChange={(v) => setValue('clientId', v, { shouldValidate: true })}
              >
                <SelectTrigger id="clientId">
                  <SelectValue placeholder="Select a client" />
                </SelectTrigger>
                <SelectContent>
                  {selectableClients.map((client) => (
                    <SelectItem key={client.id} value={client.clientId!}>
                      {`${client.firstName} ${client.lastName}`.trim() || client.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.clientId ? (
                <p className="text-sm text-destructive">{errors.clientId.message}</p>
              ) : selectableClients.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  {canReadClients ? 'No client organisations yet.' : 'You cannot read clients.'}
                </p>
              ) : null}
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="value">Discount value</Label>
              <Input
                id="value"
                type="number"
                min="0"
                step="0.1"
                placeholder="10"
                {...register('value')}
              />
              {errors.value ? (
                <p className="text-sm text-destructive">{errors.value.message}</p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Greater than zero, at most 1 decimal place.
                </p>
              )}
            </div>
          </>
        )}

        <div className="grid gap-1.5">
          <Label htmlFor="siteId">Site</Label>
          <Select
            value={siteId || NONE}
            onValueChange={(v) => setValue('siteId', v === NONE ? '' : v, { shouldValidate: true })}
          >
            <SelectTrigger id="siteId">
              <SelectValue placeholder="All sites" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>All sites</SelectItem>
              {activeSites.map((site) => (
                <SelectItem key={site.id} value={site.id}>
                  {site.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {errors.siteId ? (
            <p className="text-sm text-destructive">{errors.siteId.message}</p>
          ) : (
            <p className="text-xs text-muted-foreground">Optional — leave blank for all sites.</p>
          )}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label htmlFor="validFrom">Valid from</Label>
            <Input id="validFrom" type="date" {...register('validFrom')} />
            {errors.validFrom && (
              <p className="text-sm text-destructive">{errors.validFrom.message}</p>
            )}
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="validTo">Valid to</Label>
            <Input id="validTo" type="date" {...register('validTo')} />
            {errors.validTo && (
              <p className="text-sm text-destructive">{errors.validTo.message}</p>
            )}
          </div>
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="status">Status</Label>
          <Select
            value={status}
            onValueChange={(v) =>
              setValue('status', v as 'active' | 'inactive', { shouldValidate: true })
            }
          >
            <SelectTrigger id="status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {/* Lowercase only — the API rejects `ACTIVE`. */}
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="inactive">Inactive</SelectItem>
            </SelectContent>
          </Select>
          {errors.status && <p className="text-sm text-destructive">{errors.status.message}</p>}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" disabled={saveDiscount.isPending}>
            {saveDiscount.isPending ? 'Saving…' : discount ? 'Save changes' : 'Create discount'}
          </Button>
        </DialogFooter>
      </form>
    </FormDialog>
  )
}
