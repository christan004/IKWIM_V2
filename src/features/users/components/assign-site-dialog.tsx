import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { FormDialog } from '@/components/form-dialog'
import { Button } from '@/components/ui/button'
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
import { useAssignUserSite } from '@/features/users/use-users'
import { useSites } from '@/features/pss/use-pss'
import { fullName, type User, type UserPosition } from '@/api/types'

const schema = z.object({
  siteId: z.string().min(1, 'Choose a site'),
})

type AssignForm = z.infer<typeof schema>

/** Read as labels rather than raw camelCase, which reads as a code value. */
const POSITION_LABEL: Record<UserPosition, string> = {
  superAdmin: 'Super admin',
  siteManager: 'Site manager',
  clientAdmin: 'Client admin',
  clientUser: 'Client user',
}

const FIELD_NAMES = ['siteId'] as const

export function AssignSiteDialog({
  user,
  onOpenChange,
  canReadSites,
}: {
  /** The user being assigned; `null` closes the dialog. */
  user: User | null
  onOpenChange: (open: boolean) => void
  /** Gated on `pss.read` — sites belong to the PSS module. */
  canReadSites: boolean
}) {
  const assignSite = useAssignUserSite()
  const { sites } = useSites({ enabled: canReadSites && Boolean(user) })

  const {
    handleSubmit,
    reset,
    setValue,
    setError,
    watch,
    formState: { errors },
  } = useForm<AssignForm>({
    resolver: zodResolver(schema),
    defaultValues: { siteId: '' },
  })

  const siteId = watch('siteId')

  /**
   * An inactive site is not somewhere to post a manager, but the one already
   * assigned stays selectable — Radix falls back to the placeholder if a
   * Select's value has no mounted option, even for one render.
   */
  const selectableSites = sites.filter(
    (s) => s.status === 'active' || s.id === user?.siteId || s.id === siteId,
  )

  useEffect(() => {
    if (!user) return
    // Seeded from the record, so reassigning shows the current posting rather
    // than an empty form.
    reset({ siteId: user.siteId ?? '' })
  }, [user, reset])

  function onSubmit(values: AssignForm) {
    if (!user) return

    assignSite.mutate(
      // The dedicated endpoint takes `siteId` on its own.
      { id: user.id, siteId: values.siteId },
      {
        onSuccess: () => {
          const site = sites.find((s) => s.id === values.siteId)
          toast.success(`${fullName(user)} assigned to ${site?.name ?? 'the site'}`)
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

  const isReassignment = Boolean(user?.siteId)

  return (
    <FormDialog
      open={Boolean(user)}
      onOpenChange={onOpenChange}
      title={isReassignment ? 'Change site assignment' : 'Assign to a site'}
      description={user ? `${fullName(user)} · ${user.email}` : ''}
    >
      <form onSubmit={handleSubmit(onSubmit)} className="grid gap-4">
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
          ) : !canReadSites ? (
            <p className="text-xs text-muted-foreground">
              Sites cannot be listed without the PSS read permission.
            </p>
          ) : (
            selectableSites.length === 0 && (
              <p className="text-xs text-muted-foreground">No active sites available.</p>
            )
          )}
        </div>

        {/* The user's current position, shown for context. This endpoint takes
            only `siteId`, so changing a position goes through PUT /users/:id
            instead — offering it here would imply it is saved with the site. */}
        {user?.position && (
          <p className="text-xs text-muted-foreground">
            Position: <span className="font-medium text-foreground">
              {POSITION_LABEL[user.position] ?? user.position}
            </span>{' '}
            — unchanged by this action.
          </p>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" disabled={assignSite.isPending}>
            {assignSite.isPending ? 'Saving…' : isReassignment ? 'Update assignment' : 'Assign'}
          </Button>
        </DialogFooter>
      </form>
    </FormDialog>
  )
}
