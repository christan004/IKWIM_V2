import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { FormDialog } from '@/components/form-dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { DialogFooter } from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { errorMessage, fieldErrors } from '@/lib/error-message'
import { useCreateClient, useUpdateClient } from '@/features/clients/use-clients'
import { useRoles } from '@/features/roles/use-roles'
import { LocationCascadeSelect } from '@/features/locations/components/location-cascade-select'
import { CLIENT_POSITIONS, type Client, type ClientPosition } from '@/api/types'

/** Sentinel for "no role" — Radix Select cannot hold an empty string. */
const NONE = '__none__'

const schema = z
  .object({
    position: z.enum(['clientAdmin', 'clientUser']),
    email: z.string().min(1, 'Email is required').email('Must be a valid email address'),
    // Required on create, optional on edit — refined below against `isEdit`.
    password: z.string(),
    firstName: z.string().trim().min(1, 'First name is required'),
    lastName: z.string().trim().min(1, 'Last name is required'),
    phone: z.string(),
    // The API takes 4-8 digits when present, and it is optional.
    pin: z.string(),
    roleId: z.string(),
    /** `clientUser` only — the organisation to join. */
    clientId: z.string(),
    /** `clientAdmin` only — the organisation to create. */
    clientCode: z.string(),
    clientPin: z.string(),
    discountType: z.string(),
    clientName: z.string(),
    clientPhone: z.string(),
    clientEmail: z.string(),
    idTino: z.string(),
    province: z.string(),
    district: z.string(),
    sector: z.string(),
    comments: z.string(),
    subsidyAllowed: z.boolean(),
  })
  .superRefine((values, ctx) => {
    const issue = (path: string, message: string) =>
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: [path], message })

    // Both branches: the API enforces these whenever the field is present.
    if (values.password !== '' && values.password.length < 8) {
      issue('password', 'Must contain at least 8 characters')
    }
    if (values.pin !== '' && !/^\d{4,8}$/.test(values.pin)) {
      issue('pin', 'Must contain between 4 and 8 digits')
    }
    if (values.clientEmail !== '' && !z.string().email().safeParse(values.clientEmail).success) {
      issue('clientEmail', 'Must be a valid email address')
    }

    // The discriminated branches — see `ClientRequest`.
    if (values.position === 'clientUser') {
      if (values.clientId === '') issue('clientId', 'Choose the client this user belongs to')
    } else {
      if (values.clientCode.trim() === '') issue('clientCode', 'Client code is required')
      if (values.clientPin.trim() === '') issue('clientPin', 'Client PIN is required')
      if (values.discountType.trim() === '') issue('discountType', 'Discount type is required')
    }
  })

type ClientForm = z.infer<typeof schema>

const emptyValues: ClientForm = {
  position: 'clientAdmin',
  email: '',
  password: '',
  firstName: '',
  lastName: '',
  phone: '',
  pin: '',
  roleId: '',
  clientId: '',
  clientCode: '',
  clientPin: '',
  discountType: '',
  clientName: '',
  clientPhone: '',
  clientEmail: '',
  idTino: '',
  province: '',
  district: '',
  sector: '',
  comments: '',
  subsidyAllowed: false,
}

const POSITION_LABELS: Record<ClientPosition, string> = {
  clientAdmin: 'Client admin — creates a new client organisation',
  clientUser: 'Client user — joins an existing organisation',
}

const FIELD_NAMES = ['email', 'password', 'firstName', 'lastName', 'phone', 'pin', 'roleId', 'clientId'] as const

export function ClientFormDialog({
  open,
  onOpenChange,
  client,
  organizations,
  canReadRoles,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Present when editing. */
  client?: Client | null
  /** Derived from existing users — the API lists no organisations. */
  organizations: { id: string; label: string; memberCount: number }[]
  /** Gated on `roles.read`, not the clients permission. */
  canReadRoles: boolean
}) {
  const isEdit = Boolean(client)
  const createClient = useCreateClient()
  const updateClient = useUpdateClient()
  const { roles } = useRoles({ enabled: canReadRoles })

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    setError,
    watch,
    formState: { errors, dirtyFields },
  } = useForm<ClientForm>({ resolver: zodResolver(schema), defaultValues: emptyValues })

  const position = watch('position')
  const roleId = watch('roleId')
  const clientId = watch('clientId')
  const subsidyAllowed = watch('subsidyAllowed')
  const province = watch('province')
  const district = watch('district')
  const sector = watch('sector')

  useEffect(() => {
    if (!open) return
    reset(
      client
        ? {
            ...emptyValues,
            position: client.position,
            email: client.email,
            firstName: client.firstName,
            lastName: client.lastName,
            phone: client.phone ?? '',
            roleId: client.role?.id ?? '',
            clientId: client.clientId ?? '',
          }
        : emptyValues,
    )
  }, [open, client, reset])

  function onSubmit(values: ClientForm) {
    const onError = (err: unknown) => {
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
    }

    if (client) {
      // A true patch: only what actually changed is sent, so an untouched
      // password is never overwritten with a blank.
      const patch: Record<string, string> = {}
      if (dirtyFields.email) patch.email = values.email
      if (dirtyFields.password && values.password) patch.password = values.password
      if (dirtyFields.pin && values.pin) patch.pin = values.pin
      if (dirtyFields.firstName) patch.firstName = values.firstName
      if (dirtyFields.lastName) patch.lastName = values.lastName
      if (dirtyFields.phone) patch.phone = values.phone
      if (dirtyFields.roleId && values.roleId) patch.roleId = values.roleId
      if (dirtyFields.clientId && values.clientId) patch.clientId = values.clientId

      if (Object.keys(patch).length === 0) {
        // The API rejects an empty body, so say so rather than sending it.
        toast.info('Nothing changed')
        return
      }

      updateClient.mutate(
        { id: client.id, ...patch },
        {
          onSuccess: () => {
            toast.success('Client updated')
            onOpenChange(false)
          },
          onError,
        },
      )
      return
    }

    // Create: the body shape follows `position`, so the two branches are built
    // separately rather than sending fields the other branch would reject.
    const shared = {
      email: values.email,
      password: values.password,
      firstName: values.firstName,
      lastName: values.lastName,
      // Each is omitted when blank — all three are optional.
      ...(values.phone ? { phone: values.phone } : {}),
      ...(values.pin ? { pin: values.pin } : {}),
      ...(values.roleId ? { roleId: values.roleId } : {}),
    }

    createClient.mutate(
      values.position === 'clientUser'
        ? { ...shared, position: 'clientUser', clientId: values.clientId }
        : {
            ...shared,
            position: 'clientAdmin',
            clientDetails: {
              // The three the API requires.
              clientCode: values.clientCode,
              pin: values.clientPin,
              discountType: values.discountType,
              // The rest are optional, so blanks are omitted.
              ...(values.clientName ? { name: values.clientName } : {}),
              ...(values.clientPhone ? { phone: values.clientPhone } : {}),
              ...(values.clientEmail ? { email: values.clientEmail } : {}),
              ...(values.idTino ? { idTino: values.idTino } : {}),
              ...(values.province ? { province: values.province } : {}),
              ...(values.district ? { district: values.district } : {}),
              ...(values.sector ? { sector: values.sector } : {}),
              ...(values.comments ? { comments: values.comments } : {}),
              subsidyAllowed: values.subsidyAllowed,
            },
          },
      {
        onSuccess: () => {
          toast.success('Client created')
          onOpenChange(false)
        },
        onError,
      },
    )
  }

  const isPending = createClient.isPending || updateClient.isPending
  const selectableRoles = roles.filter((r) => r.isActive !== false || r.id === roleId)

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={isEdit ? 'Edit client' : 'New client'}
      description={
        isEdit
          ? 'Only the fields you change are sent.'
          : 'A client admin creates a new organisation; a client user joins one that exists.'
      }
    >
      <form onSubmit={handleSubmit(onSubmit)} className="grid gap-4">
        <div className="grid gap-1.5">
          <Label htmlFor="position">Kind of client</Label>
          <Select
            value={position}
            // Switching this on an existing client would change which branch the
            // record belongs to, which the update endpoint cannot express.
            disabled={isEdit}
            onValueChange={(v) =>
              setValue('position', v as ClientPosition, { shouldValidate: true })
            }
          >
            <SelectTrigger id="position">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CLIENT_POSITIONS.map((value) => (
                <SelectItem key={value} value={value}>
                  {POSITION_LABELS[value]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {errors.position && (
            <p className="text-sm text-destructive">{errors.position.message}</p>
          )}
        </div>

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

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" placeholder="client@example.com" {...register('email')} />
            {errors.email && <p className="text-sm text-destructive">{errors.email.message}</p>}
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="phone">Phone</Label>
            <Input id="phone" placeholder="0787866990" {...register('phone')} />
            {errors.phone ? (
              <p className="text-sm text-destructive">{errors.phone.message}</p>
            ) : (
              <p className="text-xs text-muted-foreground">Optional.</p>
            )}
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              autoComplete="new-password"
              placeholder={isEdit ? 'Leave blank to keep' : '••••••••'}
              {...register('password')}
            />
            {errors.password ? (
              <p className="text-sm text-destructive">{errors.password.message}</p>
            ) : (
              <p className="text-xs text-muted-foreground">
                {isEdit ? 'Leave blank to keep the current one.' : 'At least 8 characters.'}
              </p>
            )}
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="pin">PIN</Label>
            <Input id="pin" inputMode="numeric" placeholder="123456" {...register('pin')} />
            {errors.pin ? (
              <p className="text-sm text-destructive">{errors.pin.message}</p>
            ) : (
              <p className="text-xs text-muted-foreground">Optional — 4 to 8 digits.</p>
            )}
          </div>
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="roleId">Role</Label>
          <Select
            value={roleId || NONE}
            onValueChange={(v) => setValue('roleId', v === NONE ? '' : v, { shouldValidate: true })}
          >
            <SelectTrigger id="roleId">
              <SelectValue placeholder="No role" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>No role</SelectItem>
              {selectableRoles.map((role) => (
                <SelectItem key={role.id} value={role.id}>
                  {role.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {errors.roleId ? (
            <p className="text-sm text-destructive">{errors.roleId.message}</p>
          ) : (
            <p className="text-xs text-muted-foreground">Optional.</p>
          )}
        </div>

        {/* ---- the discriminated half ---- */}
        {position === 'clientUser' ? (
          <div className="grid gap-1.5">
            <Label htmlFor="clientId">Client organisation</Label>
            <Select
              value={clientId}
              onValueChange={(v) => setValue('clientId', v, { shouldValidate: true })}
            >
              <SelectTrigger id="clientId">
                <SelectValue placeholder="Select an organisation" />
              </SelectTrigger>
              <SelectContent>
                {organizations.map((org) => (
                  <SelectItem key={org.id} value={org.id}>
                    {org.label || org.id.slice(0, 8)}
                    <span className="text-muted-foreground">
                      {' '}
                      · {org.memberCount} {org.memberCount === 1 ? 'member' : 'members'}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.clientId ? (
              <p className="text-sm text-destructive">{errors.clientId.message}</p>
            ) : organizations.length === 0 ? (
              // Not a fault: no organisation exists until a client admin makes one.
              <p className="text-xs text-muted-foreground">
                No organisations yet — create a client admin first.
              </p>
            ) : (
              // The API lists no organisations, so this list is reconstructed.
              <p className="text-xs text-muted-foreground">
                Taken from existing clients — the API exposes no organisation list.
              </p>
            )}
          </div>
        ) : (
          !isEdit && (
            <div className="grid gap-4 rounded-md border p-3">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Client organisation
              </p>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="grid gap-1.5">
                  <Label htmlFor="clientCode">Client code</Label>
                  <Input
                    id="clientCode"
                    className="font-mono"
                    placeholder="CLIENT001"
                    {...register('clientCode')}
                  />
                  {errors.clientCode && (
                    <p className="text-sm text-destructive">{errors.clientCode.message}</p>
                  )}
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="clientName">Name</Label>
                  <Input id="clientName" placeholder="ITEC" {...register('clientName')} />
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="grid gap-1.5">
                  <Label htmlFor="clientPin">Organisation PIN</Label>
                  <Input id="clientPin" placeholder="20202" {...register('clientPin')} />
                  {errors.clientPin && (
                    <p className="text-sm text-destructive">{errors.clientPin.message}</p>
                  )}
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="discountType">Discount type</Label>
                  <Input
                    id="discountType"
                    placeholder="all discount"
                    {...register('discountType')}
                  />
                  {errors.discountType && (
                    <p className="text-sm text-destructive">{errors.discountType.message}</p>
                  )}
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="grid gap-1.5">
                  <Label htmlFor="clientPhone">Phone</Label>
                  <Input id="clientPhone" placeholder="0787855303" {...register('clientPhone')} />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="clientEmail">Email</Label>
                  <Input id="clientEmail" placeholder="itec@info.com" {...register('clientEmail')} />
                  {errors.clientEmail && (
                    <p className="text-sm text-destructive">{errors.clientEmail.message}</p>
                  )}
                </div>
              </div>

              <div className="grid gap-1.5">
                {/* Spelled `idTino` in the API, not `idTin`. */}
                <Label htmlFor="idTino">TIN</Label>
                <Input id="idTino" placeholder="120393020" {...register('idTino')} />
              </div>

              {/* Location ids, not names — the API rejects a name with
                  `Must be a valid UUID`. Each level is fetched from the one
                  above, so nothing loads until a province is chosen. */}
              <LocationCascadeSelect
                province={province}
                district={district}
                sector={sector}
                onChange={(level, id) => setValue(level, id, { shouldValidate: true })}
                errors={{
                  province: errors.province?.message,
                  district: errors.district?.message,
                  sector: errors.sector?.message,
                }}
              />

              <div className="grid gap-1.5">
                <Label htmlFor="comments">Comments</Label>
                <Input id="comments" placeholder="New client" {...register('comments')} />
              </div>

              <div className="flex items-center justify-between gap-3">
                <div>
                  <Label htmlFor="subsidyAllowed">Subsidy allowed</Label>
                  <p className="text-xs text-muted-foreground">
                    Whether this client may buy at subsidised rates.
                  </p>
                </div>
                <Switch
                  id="subsidyAllowed"
                  checked={subsidyAllowed}
                  onCheckedChange={(v) => setValue('subsidyAllowed', v, { shouldValidate: true })}
                />
              </div>
            </div>
          )
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" disabled={isPending}>
            {isPending ? 'Saving…' : isEdit ? 'Save changes' : 'Create client'}
          </Button>
        </DialogFooter>
      </form>
    </FormDialog>
  )
}
