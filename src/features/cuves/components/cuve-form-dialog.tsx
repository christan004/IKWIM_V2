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
import { useCuve, useSaveCuve } from '@/features/cuves/use-cuves'
import { ItemCascadeSelect } from '@/features/items/components/item-cascade-select'
import { useItems } from '@/features/items/use-items'
import { useUnits } from '@/features/units/use-units'
import { useSites } from '@/features/pss/use-pss'

const numeric = (label: string) =>
  z
    .string()
    .min(1, `${label} is required`)
    .refine((v) => Number.isFinite(Number(v)) && Number(v) >= 0, `${label} must be a number`)

const schema = z
  .object({
    name: z.string().min(1, 'Name is required'),
    itemId: z.string().min(1, 'Choose an item'),
    siteId: z.string().min(1, 'Choose a site'),
    minimum: numeric('Minimum'),
    maximum: numeric('Maximum'),
    // Optional in the form: the API requires the field but accepts `0`, and a
    // tank with no dead stock is a normal case.
    deadStock: z
      .string()
      .refine((v) => v === '' || (Number.isFinite(Number(v)) && Number(v) >= 0), 'Must be a number'),
  })
  // The API does not check this, and an inverted range is silently meaningless.
  .refine((v) => Number(v.maximum) > Number(v.minimum), {
    message: 'Maximum must be greater than the minimum',
    path: ['maximum'],
  })
  // Dead stock sits below the usable minimum, so exceeding it is a data error.
  .refine((v) => v.deadStock === '' || Number(v.deadStock) <= Number(v.maximum), {
    message: 'Dead stock cannot exceed the maximum',
    path: ['deadStock'],
  })

type CuveForm = z.infer<typeof schema>

const emptyValues: CuveForm = {
  name: '',
  itemId: '',
  siteId: '',
  minimum: '',
  maximum: '',
  deadStock: '',
}

const FIELD_NAMES = ['name', 'itemId', 'siteId', 'minimum', 'maximum', 'deadStock'] as const

export function CuveFormDialog({
  open,
  onOpenChange,
  cuveId,
  canReadItems,
  canReadUnits,
  canReadSites,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Present when editing; the record is fetched to seed the form. */
  cuveId?: string | null
  /** Gated on `items.read`, not the cuve permission. */
  canReadItems: boolean
  /** Gated on `units.read` — only used to label the levels with a unit. */
  canReadUnits: boolean
  /** Gated on `pss.read`. */
  canReadSites: boolean
}) {
  const saveCuve = useSaveCuve()
  const isEdit = Boolean(cuveId)
  // The list omits both ids, so editing *must* read the detail endpoint.
  const { cuve, isLoading: cuveLoading } = useCuve(open ? (cuveId ?? undefined) : undefined)
  const { rows: itemRows } = useItems({ enabled: canReadItems })
  const { units } = useUnits({ enabled: canReadUnits })
  const { sites } = useSites({ enabled: canReadSites })

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    setError,
    watch,
    formState: { errors },
  } = useForm<CuveForm>({ resolver: zodResolver(schema), defaultValues: emptyValues })

  const itemId = watch('itemId')
  const siteId = watch('siteId')

  /**
   * An inactive site stays selectable on the cuve that already uses it, and the
   * current value is always included — Radix falls back to the placeholder if a
   * Select's value has no mounted option, even for one render.
   */
  const selectableSites = sites.filter(
    (s) => s.status === 'active' || s.id === cuve?.siteId || s.id === siteId,
  )

  /** The chosen item's unit, so the levels are not bare numbers. */
  const chosenItem = itemRows.find((r) => r.id === itemId)
  const unitCode = units.find((u) => u.id === chosenItem?.baseUnitId)?.code ?? ''

  useEffect(() => {
    if (!open) return
    reset(
      cuve
        ? {
            name: cuve.name ?? '',
            itemId: cuve.itemId ?? cuve.item?.id ?? '',
            siteId: cuve.siteId ?? cuve.site?.id ?? '',
            minimum: String(cuve.minimum ?? ''),
            maximum: String(cuve.maximum ?? ''),
            deadStock: String(cuve.deadStock ?? ''),
          }
        : emptyValues,
    )
  }, [open, cuve, reset])

  function onSubmit(values: CuveForm) {
    saveCuve.mutate(
      {
        id: cuveId ?? undefined,
        name: values.name.trim(),
        itemId: values.itemId,
        siteId: values.siteId,
        minimum: Number(values.minimum),
        maximum: Number(values.maximum),
        // The API requires the field; blank means none, sent as an explicit 0
        // rather than relying on the API coercing `""`.
        deadStock: values.deadStock === '' ? 0 : Number(values.deadStock),
      },
      {
        onSuccess: () => {
          toast.success(isEdit ? 'Cuve updated' : 'Cuve created')
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
      title={isEdit ? 'Edit cuve' : 'New cuve'}
      description="A storage tank at a site."
    >
      <form onSubmit={handleSubmit(onSubmit)} className="grid gap-4">
        <div className="grid gap-1.5">
          <Label htmlFor="name">Name</Label>
          <Input id="name" placeholder="First cuve" {...register('name')} />
          {errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="siteId">Site</Label>
          <Select
            value={siteId}
            onValueChange={(v) => setValue('siteId', v, { shouldValidate: true })}
          >
            <SelectTrigger id="siteId">
              <SelectValue placeholder="Select a site" />
            </SelectTrigger>
            <SelectContent>
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
          ) : (
            sites.length === 0 && (
              <p className="text-xs text-muted-foreground">No sites available yet.</p>
            )
          )}
        </div>

        {/* The same three-level Class → Item → Category picker the Items page
            uses, so an item means the same thing in both places. */}
        <ItemCascadeSelect
          rows={itemRows}
          value={itemId}
          onChange={(id) => setValue('itemId', id, { shouldValidate: true })}
          error={errors.itemId?.message}
        />

        <div className="grid gap-4 sm:grid-cols-3">
          <div className="grid gap-1.5">
            <Label htmlFor="minimum">
              Minimum
              {unitCode && (
                <span className="ml-1 font-normal text-muted-foreground">({unitCode})</span>
              )}
            </Label>
            <Input id="minimum" type="number" min="0" step="any" placeholder="20" {...register('minimum')} />
            {errors.minimum && (
              <p className="text-sm text-destructive">{errors.minimum.message}</p>
            )}
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="maximum">
              Maximum
              {unitCode && (
                <span className="ml-1 font-normal text-muted-foreground">({unitCode})</span>
              )}
            </Label>
            <Input id="maximum" type="number" min="0" step="any" placeholder="100000" {...register('maximum')} />
            {errors.maximum && (
              <p className="text-sm text-destructive">{errors.maximum.message}</p>
            )}
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="deadStock">
              Dead stock
              {unitCode && (
                <span className="ml-1 font-normal text-muted-foreground">({unitCode})</span>
              )}
            </Label>
            <Input id="deadStock" type="number" min="0" step="any" placeholder="0" {...register('deadStock')} />
            {errors.deadStock ? (
              <p className="text-sm text-destructive">{errors.deadStock.message}</p>
            ) : (
              <p className="text-xs text-muted-foreground">Blank means none.</p>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          {/* Saving before the record arrives would submit an empty form over
              the existing cuve. */}
          <Button type="submit" disabled={saveCuve.isPending || cuveLoading}>
            {saveCuve.isPending
              ? isEdit
                ? 'Saving…'
                : 'Creating…'
              : isEdit
                ? 'Save changes'
                : 'Create cuve'}
          </Button>
        </DialogFooter>
      </form>
    </FormDialog>
  )
}
