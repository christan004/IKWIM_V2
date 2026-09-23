import { useEffect } from 'react'
import { useFieldArray, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { Plus, X } from 'lucide-react'
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
import { useSaveItem, type ItemRow } from '@/features/items/use-items'
import { useUnits } from '@/features/units/use-units'

const NO_PARENT = '__none__'

const schema = z
  .object({
    name: z.string().trim().min(1, 'Name is required'),
    descriptions: z.string().trim(),
    parentId: z.string(),
    baseUnitId: z.string().min(1, 'Choose a base unit'),
    units: z.array(
      z.object({
        unitId: z.string().min(1, 'Choose a unit'),
        // Kept as a string for the input, coerced on submit — the API requires
        // a number and rejects a numeric string.
        factorialValue: z
          .string()
          .min(1, 'Required')
          .refine((v) => Number(v) > 0, 'Must be greater than 0'),
      }),
    ),
  })
  .superRefine((values, ctx) => {
    values.units.forEach((row, i) => {
      // The base unit is implicitly 1:1, so listing it again is contradictory.
      if (row.unitId && row.unitId === values.baseUnitId) {
        ctx.addIssue({
          code: 'custom',
          path: ['units', i, 'unitId'],
          message: 'This is already the base unit',
        })
      }
      const duplicate = values.units.findIndex((o, j) => j < i && o.unitId === row.unitId)
      if (row.unitId && duplicate !== -1) {
        ctx.addIssue({
          code: 'custom',
          path: ['units', i, 'unitId'],
          message: 'This unit is already listed',
        })
      }
    })
  })

type ItemForm = z.infer<typeof schema>

const emptyValues: ItemForm = {
  name: '',
  descriptions: '',
  parentId: NO_PARENT,
  baseUnitId: '',
  units: [],
}

/** Ids of `row` and everything beneath it — an item cannot be its own ancestor. */
function descendantIds(rows: ItemRow[], rootId: string): Set<string> {
  const ids = new Set([rootId])
  let grew = true
  while (grew) {
    grew = false
    for (const row of rows) {
      if (row.parentId && ids.has(row.parentId) && !ids.has(row.id)) {
        ids.add(row.id)
        grew = true
      }
    }
  }
  return ids
}

export function ItemFormDialog({
  open,
  onOpenChange,
  item,
  allRows,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Present when editing; omitted when creating. */
  item?: ItemRow | null
  /** Every item, for the parent dropdown. */
  allRows: ItemRow[]
}) {
  const saveItem = useSaveItem()
  const { units: allUnits, isLoading: unitsLoading } = useUnits()
  const isEdit = Boolean(item)

  // Inactive units stay on items that already use them, but must not be
  // selectable for new ones — so any already referenced here is kept.
  const units = allUnits.filter((u) => u.status === 'active' || u.id === item?.baseUnitId)

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    setError,
    watch,
    control,
    formState: { errors },
  } = useForm<ItemForm>({ resolver: zodResolver(schema), defaultValues: emptyValues })

  const { fields, append, remove } = useFieldArray({ control, name: 'units' })

  useEffect(() => {
    if (!open) return
    reset(
      item
        ? {
            name: item.name,
            descriptions: item.descriptions ?? '',
            parentId: item.parentId ?? NO_PARENT,
            baseUnitId: item.baseUnitId,
            // The API never returns an item's units, so they cannot be
            // pre-filled — see the README.
            units: [],
          }
        : emptyValues,
    )
  }, [open, item, reset])

  const baseUnitId = watch('baseUnitId')
  const parentId = watch('parentId')

  // Exclude the item itself and its descendants, which would create a cycle.
  const blocked = item ? descendantIds(allRows, item.id) : new Set<string>()
  const parentOptions = allRows.filter((row) => !blocked.has(row.id))

  function onSubmit(values: ItemForm) {
    saveItem.mutate(
      {
        id: item?.id,
        name: values.name.trim(),
        baseUnitId: values.baseUnitId,
        // Optional fields are omitted rather than sent empty.
        ...(values.descriptions.trim() ? { descriptions: values.descriptions.trim() } : {}),
        parentId: values.parentId === NO_PARENT ? null : values.parentId,
        ...(values.units.length
          ? {
              units: values.units.map((u) => ({
                unitId: u.unitId,
                factorialValue: Number(u.factorialValue),
              })),
            }
          : {}),
      },
      {
        onSuccess: () => {
          // Update returns `data: []` rather than the item, so the toast uses
          // the submitted name in both cases.
          const label = values.name.trim()
          toast.success(isEdit ? `Item "${label}" updated` : `Item "${label}" created`)
          onOpenChange(false)
        },
        onError: (err) => {
          const fields = fieldErrors(err)
          if (fields?.name) setError('name', { message: fields.name })
          else if (fields?.baseUnitId) setError('baseUnitId', { message: fields.baseUnitId })
          else toast.error(errorMessage(err))
        },
      },
    )
  }

  const baseUnit = units.find((u) => u.id === baseUnitId)

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={isEdit ? 'Edit item' : 'New item'}
      description="Items are measured in a base unit. Nest one under another to group variants."
    >
      <form
        onSubmit={handleSubmit(onSubmit)}
        className="grid max-h-[70vh] gap-4 overflow-y-auto pr-1"
      >
        <div className="grid gap-1.5">
          <Label htmlFor="name">Name</Label>
          <Input id="name" placeholder="Diesel" {...register('name')} />
          {errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="descriptions">Description</Label>
          <Input id="descriptions" placeholder="Optional" {...register('descriptions')} />
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="baseUnitId">Base unit</Label>
          <Select
            value={baseUnitId}
            onValueChange={(v) => setValue('baseUnitId', v, { shouldValidate: true })}
          >
            <SelectTrigger id="baseUnitId">
              <SelectValue placeholder={unitsLoading ? 'Loading units…' : 'Select a unit'} />
            </SelectTrigger>
            <SelectContent>
              {units.map((unit) => (
                <SelectItem key={unit.id} value={unit.id}>
                  {unit.name} ({unit.code})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {errors.baseUnitId && (
            <p className="text-sm text-destructive">{errors.baseUnitId.message}</p>
          )}
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="parentId">Parent item</Label>
          <Select value={parentId} onValueChange={(v) => setValue('parentId', v)}>
            <SelectTrigger id="parentId">
              <SelectValue placeholder="Select a parent" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NO_PARENT}>— None (top-level item)</SelectItem>
              {parentOptions.map((row) => (
                <SelectItem key={row.id} value={row.id}>
                  {'  '.repeat(row.depth)}
                  {row.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Alternate units: how many base units one of each equals. */}
        <div className="grid gap-2 rounded-md border p-3">
          <div className="flex items-center justify-between">
            <Label>Other units</Label>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={!baseUnitId}
              onClick={() => append({ unitId: '', factorialValue: '' })}
            >
              <Plus className="size-3.5" />
              Add unit
            </Button>
          </div>

          {isEdit && (
            <p className="text-xs text-muted-foreground">
              The API doesn&rsquo;t return an item&rsquo;s existing units, so these start
              empty. Anything added here is sent on save.
            </p>
          )}

          {!baseUnitId ? (
            <p className="py-2 text-xs text-muted-foreground">Choose a base unit first.</p>
          ) : fields.length === 0 ? (
            <p className="py-2 text-xs text-muted-foreground">
              Optional. Add one if this item is also handled in a larger or smaller unit.
            </p>
          ) : (
            <div className="grid gap-2">
              {fields.map((field, index) => {
                const rowErrors = errors.units?.[index]
                return (
                  <div key={field.id} className="grid gap-1">
                    <div className="flex items-end gap-2">
                      <div className="grid flex-1 gap-1">
                        <Select
                          value={watch(`units.${index}.unitId`)}
                          onValueChange={(v) =>
                            setValue(`units.${index}.unitId`, v, { shouldValidate: true })
                          }
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Unit" />
                          </SelectTrigger>
                          <SelectContent>
                            {units.map((unit) => (
                              <SelectItem key={unit.id} value={unit.id}>
                                {unit.name} ({unit.code})
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="grid w-32 gap-1">
                        <Input
                          type="number"
                          min="0"
                          step="any"
                          placeholder="1000"
                          {...register(`units.${index}.factorialValue`)}
                        />
                      </div>

                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => remove(index)}
                        aria-label="Remove unit"
                      >
                        <X className="size-4" />
                      </Button>
                    </div>

                    {(rowErrors?.unitId || rowErrors?.factorialValue) && (
                      <p className="text-xs text-destructive">
                        {rowErrors?.unitId?.message ?? rowErrors?.factorialValue?.message}
                      </p>
                    )}
                  </div>
                )
              })}

              {baseUnit && (
                <p className="text-xs text-muted-foreground">
                  Each value is how many <strong>{baseUnit.code}</strong> one of that unit
                  equals.
                </p>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" disabled={saveItem.isPending}>
            {saveItem.isPending
              ? isEdit
                ? 'Saving…'
                : 'Creating…'
              : isEdit
                ? 'Save changes'
                : 'Create item'}
          </Button>
        </DialogFooter>
      </form>
    </FormDialog>
  )
}
