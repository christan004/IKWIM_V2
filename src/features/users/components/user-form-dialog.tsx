import { useEffect, useState } from 'react'
import { AlertCircle, Eye, EyeOff, RefreshCw } from 'lucide-react'
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
import { cn } from '@/lib/utils'
import { errorCode, errorMessage, fieldErrors } from '@/lib/error-message'
import { useCreateUser, useRoleOptions } from '@/features/users/use-users'
import { generatePassword, generatePin } from '@/features/users/credentials'

/** The API accepts a PIN of 4–8 digits (verified against the live endpoint). */
const PIN_MIN_LENGTH = 4
const PIN_MAX_LENGTH = 8

const schema = z.object({
  firstName: z.string().trim().min(1, 'First name is required'),
  lastName: z.string().trim().min(1, 'Last name is required'),
  email: z.string().trim().email('Enter a valid email'),
  // Optional on the API, so not enforced here either.
  phone: z.string().trim(),
  password: z.string().min(8, 'Must be at least 8 characters'),
  // A short numeric code, distinct from the password. The API accepts 4–8
  // digits and treats it as optional, so an empty field is allowed through.
  pin: z
    .string()
    .regex(
      new RegExp(`^(\\d{${PIN_MIN_LENGTH},${PIN_MAX_LENGTH}})?$`),
      `Must be ${PIN_MIN_LENGTH}–${PIN_MAX_LENGTH} digits`,
    ),
  roleId: z.string().min(1, 'Choose a role'),
})

type UserForm = z.infer<typeof schema>

const emptyValues: UserForm = {
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
  password: '',
  pin: '',
  roleId: '',
}

/** Field names the API may return errors against, mapped onto the form. */
const FIELD_NAMES = [
  'firstName',
  'lastName',
  'email',
  'phone',
  'password',
  'pin',
  'roleId',
] as const

export function UserFormDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const createUser = useCreateUser()
  const { roles, isLoading: rolesLoading } = useRoleOptions()
  const [showPassword, setShowPassword] = useState(false)
  /** True once either credential has been generated, to show the copy warning. */
  const [generated, setGenerated] = useState(false)

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    setError,
    watch,
    formState: { errors },
  } = useForm<UserForm>({ resolver: zodResolver(schema), defaultValues: emptyValues })

  // Clear the form each time the dialog opens, so a previous attempt's values
  // and errors never leak into a new one.
  useEffect(() => {
    if (open) {
      reset(emptyValues)
      setShowPassword(false)
      setGenerated(false)
    }
  }, [open, reset])

  const roleId = watch('roleId')

  function onSubmit(values: UserForm) {
    createUser.mutate(
      {
        email: values.email.trim(),
        password: values.password,
        firstName: values.firstName.trim(),
        lastName: values.lastName.trim(),
        roleId: values.roleId,
        // Both are optional on the API — omit rather than send an empty string.
        ...(values.pin ? { pin: values.pin } : {}),
        ...(values.phone.trim() ? { phone: values.phone.trim() } : {}),
      },
      {
        onSuccess: (created) => {
          toast.success(`User "${created?.email ?? values.email}" created`)
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

          // A duplicate email collides on the unique index, reported as a
          // conflict rather than a field error — surface it on the input the
          // user can actually fix.
          if (errorCode(err) === 'RESOURCE_CONFLICT') {
            setError('email', { message: 'A user with this email already exists.' })
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
      title="New user"
      description="They sign in with this email and password. The PIN is used for in-app confirmations."
    >
      <form onSubmit={handleSubmit(onSubmit)} className="grid gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label htmlFor="firstName">First name</Label>
            <Input id="firstName" placeholder="Pascal" {...register('firstName')} />
            {errors.firstName && (
              <p className="text-sm text-destructive">{errors.firstName.message}</p>
            )}
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="lastName">Last name</Label>
            <Input id="lastName" placeholder="NP" {...register('lastName')} />
            {errors.lastName && (
              <p className="text-sm text-destructive">{errors.lastName.message}</p>
            )}
          </div>
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            autoComplete="off"
            placeholder="name@petrox.local"
            {...register('email')}
          />
          {errors.email && <p className="text-sm text-destructive">{errors.email.message}</p>}
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="phone">Phone</Label>
          <Input id="phone" inputMode="tel" placeholder="0787866303" {...register('phone')} />
          {errors.phone && <p className="text-sm text-destructive">{errors.phone.message}</p>}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label htmlFor="password">Password</Label>
            <div className="flex gap-1.5">
              <div className="relative flex-1">
                <Input
                  id="password"
                  // Generated credentials are read off the screen and passed on,
                  // so the field can be revealed rather than forced to dots.
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  placeholder="••••••••"
                  className={cn('pr-9', showPassword && 'font-mono')}
                  {...register('password')}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
              <Button
                type="button"
                variant="outline"
                size="icon"
                title="Generate a password"
                onClick={() => {
                  setValue('password', generatePassword(), { shouldValidate: true })
                  setShowPassword(true)
                  setGenerated(true)
                }}
              >
                <RefreshCw />
              </Button>
            </div>
            {errors.password ? (
              <p className="text-sm text-destructive">{errors.password.message}</p>
            ) : (
              <p className="text-xs text-muted-foreground">
                At least 8 characters, or generate one.
              </p>
            )}
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="pin">PIN</Label>
            <div className="flex gap-1.5">
              <Input
                id="pin"
                inputMode="numeric"
                maxLength={PIN_MAX_LENGTH}
                autoComplete="off"
                placeholder="123456"
                className="flex-1 font-mono"
                {...register('pin')}
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                title="Generate a PIN"
                onClick={() => {
                  setValue('pin', generatePin(), { shouldValidate: true })
                  setGenerated(true)
                }}
              >
                <RefreshCw />
              </Button>
            </div>
            {errors.pin ? (
              <p className="text-sm text-destructive">{errors.pin.message}</p>
            ) : (
              <p className="text-xs text-muted-foreground">4–8 digits, or generate one.</p>
            )}
          </div>
        </div>

        {/* Generated credentials only exist here — there is no way to read them
            back once the dialog closes. */}
        {generated && (
          <div className="flex items-start gap-2 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-xs">
            <AlertCircle className="mt-0.5 size-3.5 shrink-0 text-warning" />
            <span className="text-muted-foreground">
              Copy the generated credentials before saving — they cannot be retrieved
              afterwards.
            </span>
          </div>
        )}

        <div className="grid gap-1.5">
          <Label htmlFor="roleId">Role</Label>
          <Select value={roleId} onValueChange={(value) => setValue('roleId', value)}>
            <SelectTrigger id="roleId">
              <SelectValue placeholder={rolesLoading ? 'Loading roles…' : 'Select a role'} />
            </SelectTrigger>
            <SelectContent>
              {roles.map((role) => (
                <SelectItem key={role.id} value={role.id}>
                  {role.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {errors.roleId ? (
            <p className="text-sm text-destructive">{errors.roleId.message}</p>
          ) : (
            <p className="text-xs text-muted-foreground">
              Determines what this user can see and do.
            </p>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" disabled={createUser.isPending}>
            {createUser.isPending ? 'Creating…' : 'Create user'}
          </Button>
        </DialogFooter>
      </form>
    </FormDialog>
  )
}
