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
import { errorMessage, fieldErrors } from '@/lib/error-message'
import { useSaveSite, useSite } from '@/features/pss/use-pss'

const schema = z.object({
  name: z.string().min(1, 'Name is required'),
  // Optional on the API, so blank is allowed — but a value that is present must
  // still look like an email, since the API format-validates it.
  phone: z.string(),
  email: z.union([z.literal(''), z.string().email('Enter a valid email address')]),
  address: z.string(),
})

type SiteForm = z.infer<typeof schema>

const emptyValues: SiteForm = { name: '', phone: '', email: '', address: '' }

const FIELD_NAMES = ['name', 'phone', 'email', 'address'] as const

export function SiteFormDialog({
  open,
  onOpenChange,
  siteId,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Present when editing; the record is fetched to seed the form. */
  siteId?: string | null
}) {
  const saveSite = useSaveSite()
  const isEdit = Boolean(siteId)
  const { site, isLoading: siteLoading } = useSite(open ? (siteId ?? undefined) : undefined)

  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors },
  } = useForm<SiteForm>({ resolver: zodResolver(schema), defaultValues: emptyValues })

  useEffect(() => {
    if (!open) return
    reset(
      site
        ? {
            name: site.name ?? '',
            // The optional fields come back `null` when unset, which an input
            // cannot hold.
            phone: site.phone ?? '',
            email: site.email ?? '',
            address: site.address ?? '',
          }
        : emptyValues,
    )
  }, [open, site, reset])

  function onSubmit(values: SiteForm) {
    const phone = values.phone.trim()
    const email = values.email.trim()
    const address = values.address.trim()

    saveSite.mutate(
      {
        id: siteId ?? undefined,
        name: values.name.trim(),
        // Omitted entirely when blank, rather than sent as an empty string.
        ...(phone ? { phone } : {}),
        ...(email ? { email } : {}),
        ...(address ? { address } : {}),
      },
      {
        onSuccess: () => {
          toast.success(isEdit ? 'Site updated' : 'Site created')
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
      title={isEdit ? 'Edit site' : 'New site'}
      description="A PSS site."
    >
      <form onSubmit={handleSubmit(onSubmit)} className="grid gap-4">
        <div className="grid gap-1.5">
          <Label htmlFor="name">Name</Label>
          <Input id="name" placeholder="KABUYE" {...register('name')} />
          {errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label htmlFor="phone">Phone</Label>
            <Input id="phone" placeholder="0787844303" {...register('phone')} />
            {errors.phone ? (
              <p className="text-sm text-destructive">{errors.phone.message}</p>
            ) : (
              <p className="text-xs text-muted-foreground">Optional.</p>
            )}
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" placeholder="site@example.com" {...register('email')} />
            {errors.email ? (
              <p className="text-sm text-destructive">{errors.email.message}</p>
            ) : (
              <p className="text-xs text-muted-foreground">Optional.</p>
            )}
          </div>
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="address">Address</Label>
          <Input id="address" placeholder="Kigali, Gasabo" {...register('address')} />
          {errors.address ? (
            <p className="text-sm text-destructive">{errors.address.message}</p>
          ) : (
            <p className="text-xs text-muted-foreground">Optional.</p>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          {/* Saving before the record arrives would submit an empty form over
              the existing site. */}
          <Button type="submit" disabled={saveSite.isPending || siteLoading}>
            {saveSite.isPending
              ? isEdit
                ? 'Saving…'
                : 'Creating…'
              : isEdit
                ? 'Save changes'
                : 'Create site'}
          </Button>
        </DialogFooter>
      </form>
    </FormDialog>
  )
}
