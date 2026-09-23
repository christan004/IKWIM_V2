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
import { errorCode, errorMessage, fieldErrors } from '@/lib/error-message'
import { useSaveDeport } from '@/features/deports/use-deports'
import { DEPORT_TYPES, type Deport, type DeportType } from '@/api/types'

const schema = z.object({
  name: z.string().trim().min(1, 'Name is required'),
  type: z.enum(DEPORT_TYPES, { message: 'Choose a type' }),
  location: z.string().trim().min(1, 'Location is required'),
})

type DeportForm = z.infer<typeof schema>

const emptyValues: DeportForm = { name: '', type: 'local', location: '' }

const TYPE_LABEL: Record<DeportType, string> = {
  local: 'Local',
  foreign: 'Foreign',
  international: 'International',
}

const FIELD_NAMES = ['name', 'type', 'location'] as const

export function DeportFormDialog({
  open,
  onOpenChange,
  deport,
  existingDeports,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Present when editing; omitted when creating. */
  deport?: Deport | null
  /** Used to warn about duplicate names before hitting the API. */
  existingDeports: Deport[]
}) {
  const saveDeport = useSaveDeport()
  const isEdit = Boolean(deport)

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    setError,
    watch,
    formState: { errors },
  } = useForm<DeportForm>({ resolver: zodResolver(schema), defaultValues: emptyValues })

  useEffect(() => {
    if (!open) return
    reset(
      deport
        ? { name: deport.name, type: deport.type, location: deport.location }
        : emptyValues,
    )
  }, [open, deport, reset])

  const type = watch('type')

  function onSubmit(values: DeportForm) {
    const name = values.name.trim()

    const clash = existingDeports.find(
      (d) => d.id !== deport?.id && d.name.toLowerCase() === name.toLowerCase(),
    )
    if (clash) {
      setError('name', { message: `"${clash.name}" already exists.` })
      return
    }

    saveDeport.mutate(
      { id: deport?.id, name, type: values.type, location: values.location.trim() },
      {
        onSuccess: () => {
          toast.success(isEdit ? `Deport "${name}" updated` : `Deport "${name}" created`)
          onOpenChange(false)
        },
        onError: (err) => {
          const fields = fieldErrors(err)
          if (fields) {
            let matched = false
            for (const field of FIELD_NAMES) {
              const message = fields[field]
              if (message) {
                setError(field, { message })
                matched = true
              }
            }
            if (matched) return
          }
          if (errorCode(err) === 'RESOURCE_CONFLICT') {
            setError('name', { message: 'A deport with this name already exists.' })
            return
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
      title={isEdit ? 'Edit deport' : 'New deport'}
      description="A storage depot that stock is held at."
    >
      <form onSubmit={handleSubmit(onSubmit)} className="grid gap-4">
        <div className="grid gap-1.5">
          <Label htmlFor="name">Name</Label>
          <Input id="name" placeholder="Rwanda" {...register('name')} />
          {errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="type">Type</Label>
          <Select
            value={type}
            onValueChange={(v) => setValue('type', v as DeportType, { shouldValidate: true })}
          >
            <SelectTrigger id="type">
              <SelectValue placeholder="Select a type" />
            </SelectTrigger>
            <SelectContent>
              {DEPORT_TYPES.map((option) => (
                <SelectItem key={option} value={option}>
                  {TYPE_LABEL[option]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {errors.type && <p className="text-sm text-destructive">{errors.type.message}</p>}
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="location">Location</Label>
          <Input id="location" placeholder="Kigali, Muhima" {...register('location')} />
          {errors.location && (
            <p className="text-sm text-destructive">{errors.location.message}</p>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" disabled={saveDeport.isPending}>
            {saveDeport.isPending
              ? isEdit
                ? 'Saving…'
                : 'Creating…'
              : isEdit
                ? 'Save changes'
                : 'Create deport'}
          </Button>
        </DialogFooter>
      </form>
    </FormDialog>
  )
}
