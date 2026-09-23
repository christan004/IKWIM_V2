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
import { useSaveAuthorizer } from '@/features/authorizers/use-authorizers'
import { useRoles } from '@/features/roles/use-roles'
import { AUTHORIZER_TYPES, type Authorizer, type AuthorizerType } from '@/api/types'

const schema = z.object({
  type: z.enum(['LOADING_ORDER']),
  // Kept as a string for the input, parsed on submit.
  levels: z
    .string()
    .min(1, 'Level is required')
    .refine((v) => Number.isInteger(Number(v)), 'Must be a whole number')
    .refine((v) => Number(v) > 0, 'Must be greater than 0'),
  roleId: z.string().min(1, 'Choose a role'),
})

type AuthorizerForm = z.infer<typeof schema>

const emptyValues: AuthorizerForm = {
  // The only value the API accepts today.
  type: 'LOADING_ORDER',
  levels: '1',
  roleId: '',
}

const FIELD_NAMES = ['type', 'levels', 'roleId'] as const

/** Reads better than the raw code. */
const TYPE_LABELS: Record<AuthorizerType, string> = {
  LOADING_ORDER: 'Loading order',
}

/**
 * Creates or edits an authorizer — the role that may sign off a stockout, and
 * at which level in the approval chain.
 */
export function AuthorizerFormDialog({
  open,
  onOpenChange,
  authorizer,
  canReadRoles,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Present when editing; the list row carries every field, so no fetch. */
  authorizer?: Authorizer | null
  /** Gated on `roles.read`, not the authorizers permission. */
  canReadRoles: boolean
}) {
  const saveAuthorizer = useSaveAuthorizer()
  const { roles } = useRoles({ enabled: canReadRoles })

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    setError,
    watch,
    formState: { errors },
  } = useForm<AuthorizerForm>({ resolver: zodResolver(schema), defaultValues: emptyValues })

  const type = watch('type')
  const roleId = watch('roleId')

  useEffect(() => {
    if (!open) return
    reset(
      authorizer
        ? {
            type: authorizer.type,
            levels: String(authorizer.levels ?? ''),
            roleId: authorizer.role?.id ?? authorizer.roleId ?? '',
          }
        : emptyValues,
    )
  }, [open, authorizer, reset])

  /** An inactive role cannot be given new authority, but an existing one shows. */
  const selectableRoles = roles.filter((r) => r.isActive !== false || r.id === roleId)

  function onSubmit(values: AuthorizerForm) {
    saveAuthorizer.mutate(
      {
        ...(authorizer ? { id: authorizer.id } : {}),
        type: values.type,
        levels: Number(values.levels),
        roleId: values.roleId,
      },
      {
        onSuccess: () => {
          toast.success(authorizer ? 'Authorizer updated' : 'Authorizer created')
          onOpenChange(false)
        },
        onError: (err) => {
          // An unknown role comes back as a 404 rather than a field error, so
          // it is attached to the field it is actually about.
          if (errorCode(err) === 'RESOURCE_NOT_FOUND' && /role/i.test(errorMessage(err))) {
            setError('roleId', { message: 'That role no longer exists' })
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
      title={authorizer ? 'Edit authorizer' : 'New authorizer'}
      description="The role that may sign off a stockout, and where it sits in the approval chain."
    >
      <form onSubmit={handleSubmit(onSubmit)} className="grid gap-4">
        <div className="grid gap-1.5">
          <Label htmlFor="type">Authorises</Label>
          <Select
            value={type}
            // One value today, so there is nothing to choose between — the
            // control is locked rather than presented as a decision.
            disabled={AUTHORIZER_TYPES.length === 1}
            onValueChange={(v) => setValue('type', v as AuthorizerType, { shouldValidate: true })}
          >
            <SelectTrigger id="type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {AUTHORIZER_TYPES.map((value) => (
                <SelectItem key={value} value={value}>
                  {TYPE_LABELS[value]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {errors.type ? (
            <p className="text-sm text-destructive">{errors.type.message}</p>
          ) : (
            <p className="text-xs text-muted-foreground">
              Loading orders are the only thing authorised today.
            </p>
          )}
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="roleId">Role</Label>
          <Select
            value={roleId}
            onValueChange={(v) => setValue('roleId', v, { shouldValidate: true })}
          >
            <SelectTrigger id="roleId">
              <SelectValue placeholder="Select a role" />
            </SelectTrigger>
            <SelectContent>
              {selectableRoles.map((role) => (
                <SelectItem key={role.id} value={role.id}>
                  {role.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {errors.roleId ? (
            <p className="text-sm text-destructive">{errors.roleId.message}</p>
          ) : selectableRoles.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              {canReadRoles ? 'No roles available yet.' : 'You cannot read roles.'}
            </p>
          ) : (
            // The authority belongs to the role, not to one person — worth
            // saying, since it is the whole point of the feature.
            <p className="text-xs text-muted-foreground">
              Anyone holding this role can authorise.
            </p>
          )}
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="levels">Level</Label>
          <Input id="levels" type="number" min="1" step="1" placeholder="1" {...register('levels')} />
          {errors.levels ? (
            <p className="text-sm text-destructive">{errors.levels.message}</p>
          ) : (
            <p className="text-xs text-muted-foreground">
              Order in the approval chain — level 1 signs first.
            </p>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" disabled={saveAuthorizer.isPending}>
            {saveAuthorizer.isPending ? 'Saving…' : authorizer ? 'Save changes' : 'Create authorizer'}
          </Button>
        </DialogFooter>
      </form>
    </FormDialog>
  )
}
