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
import { useCreateModule, useUpdateModule, type ParentOption } from '@/features/modules/use-modules'
import type { ModuleTreeNode } from '@/features/modules/module-tree'

/** Sentinel for "no parent" — Radix Select cannot hold an empty string value. */
const NO_PARENT = '__none__'

const schema = z.object({
  name: z.string().trim().min(1, 'Name is required'),
  icon: z.string().trim().optional(),
  parentId: z.string().optional(),
})

type ModuleForm = z.infer<typeof schema>

const emptyValues: ModuleForm = { name: '', icon: '', parentId: NO_PARENT }

export function ModuleFormDialog({
  open,
  onOpenChange,
  parentOptions,
  module: editing,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  parentOptions: ParentOption[]
  /**
   * Present when editing. The edit endpoint takes only `name` and `icon`, so
   * the parent control is hidden — re-parenting is not something it can express.
   */
  module?: ModuleTreeNode | null
}) {
  const isEdit = Boolean(editing)
  const createModule = useCreateModule()
  const updateModule = useUpdateModule()

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    setError,
    watch,
    formState: { errors },
  } = useForm<ModuleForm>({ resolver: zodResolver(schema), defaultValues: emptyValues })

  // Clear the form each time the dialog opens, so a previous attempt's values
  // and errors never leak into a new one.
  useEffect(() => {
    if (!open) return
    reset(
      editing
        ? { name: editing.name, icon: editing.icon ?? '', parentId: NO_PARENT }
        : emptyValues,
    )
  }, [open, editing, reset])

  const parentId = watch('parentId')

  function onSubmit(values: ModuleForm) {
    const onError = (err: unknown) => {
      // Validation errors come back keyed by array position on create, since
      // that endpoint is bulk — `[0].name` rather than `name`.
      const fields = fieldErrors(err)
      const nameError = fields?.['[0].name'] ?? fields?.name

      if (nameError) {
        setError('name', { message: nameError })
        return
      }

      // A duplicate name collides on the generated code, which the API reports
      // as RESOURCE_CONFLICT against `Module_code_key` rather than a field
      // error — surface it on the input the user can actually fix.
      if (errorCode(err) === 'RESOURCE_CONFLICT') {
        setError('name', { message: 'A module with this name already exists.' })
        return
      }

      toast.error(errorMessage(err))
    }

    if (editing) {
      updateModule.mutate(
        {
          id: editing.id,
          name: values.name.trim(),
          // Cleared deliberately when blank: the endpoint accepts null.
          icon: values.icon?.trim() ? values.icon.trim() : null,
        },
        {
          onSuccess: () => {
            toast.success(`Module "${values.name.trim()}" updated`, {
              // The code is derived at creation and never changes, so a rename
              // leaves it behind — worth saying, since it is the sidebar key.
              description: `Its code stays ${editing.code}.`,
            })
            onOpenChange(false)
          },
          onError,
        },
      )
      return
    }

    createModule.mutate(
      {
        name: values.name.trim(),
        icon: values.icon?.trim() ? values.icon.trim() : null,
        parentId: values.parentId === NO_PARENT ? null : values.parentId,
      },
      {
        onSuccess: ([created]) => {
          toast.success(`Module "${created?.name ?? values.name}" created`, {
            description: 'Five permissions were generated for it.',
          })
          onOpenChange(false)
        },
        onError,
      },
    )
  }

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={isEdit ? 'Edit module' : 'New module'}
      description={
        isEdit
          ? 'Rename the module or change its icon. Its code and position stay as they are.'
          : 'Modules form the sidebar. Nest one under another to create a service or feature.'
      }
    >
      <form onSubmit={handleSubmit(onSubmit)} className="grid gap-4">
        <div className="grid gap-1.5">
          <Label htmlFor="name">Name</Label>
          <Input id="name" placeholder="Supply Chain" {...register('name')} />
          {errors.name ? (
            <p className="text-sm text-destructive">{errors.name.message}</p>
          ) : isEdit ? (
            // The code was derived at creation and is not editable, so a rename
            // leaves it unchanged — and the sidebar keys off the code.
            <p className="text-xs text-muted-foreground">
              The code stays <code className="font-mono">{editing?.code}</code> — renaming
              does not change it.
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">
              The code is generated from this — &ldquo;Supply Chain&rdquo; becomes{' '}
              <code className="font-mono">SUPPLY_CHAIN</code>.
            </p>
          )}
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="icon">Icon</Label>
          <Input id="icon" placeholder="Truck" {...register('icon')} />
          <p className="text-xs text-muted-foreground">
            Optional. A{' '}
            <a
              href="https://lucide.dev/icons"
              target="_blank"
              rel="noreferrer"
              className="underline underline-offset-2 hover:text-primary"
            >
              lucide icon
            </a>{' '}
            name, e.g. <code className="font-mono">Truck</code>.
          </p>
        </div>

        {/* The edit endpoint takes only name and icon, so re-parenting is not
            something it can express — the control is hidden rather than shown
            and ignored. */}
        {!isEdit && (
        <div className="grid gap-1.5">
          <Label htmlFor="parentId">Parent</Label>
          <Select
            value={parentId}
            onValueChange={(value) => setValue('parentId', value)}
          >
            <SelectTrigger id="parentId">
              <SelectValue placeholder="Select a parent" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NO_PARENT}>— None (top-level module)</SelectItem>
              {parentOptions.map((option) => (
                <SelectItem key={option.id} value={option.id}>
                  {'  '.repeat(option.depth)}
                  {option.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Leave empty for a top-level module. Nesting under a module makes it a service;
            under a service, a feature.
          </p>
        </div>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" disabled={createModule.isPending || updateModule.isPending}>
            {isEdit
              ? updateModule.isPending
                ? 'Saving…'
                : 'Save changes'
              : createModule.isPending
                ? 'Creating…'
                : 'Create module'}
          </Button>
        </DialogFooter>
      </form>
    </FormDialog>
  )
}
