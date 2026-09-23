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
import { useSaveCompanyAccount } from '@/features/company-accounts/use-company-accounts'
import type { CompanyAccount } from '@/api/types'

const schema = z.object({
  // Both are required and must be non-empty — `.trim()` so whitespace alone
  // cannot satisfy the API's `>=1 characters` rule.
  code: z.string().trim().min(1, 'Account code is required'),
  name: z.string().trim().min(1, 'Account name is required'),
})

type CompanyAccountForm = z.infer<typeof schema>

const emptyValues: CompanyAccountForm = { code: '', name: '' }

const FIELD_NAMES = ['code', 'name'] as const

/**
 * Creates or edits a company bank account.
 *
 * Both fields are **required on update too** — a partial body is rejected — so
 * the edit path sends the whole record rather than a patch.
 */
export function CompanyAccountFormDialog({
  open,
  onOpenChange,
  account,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Present when editing; the list row carries every field, so no fetch. */
  account?: CompanyAccount | null
}) {
  const saveAccount = useSaveCompanyAccount()

  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors },
  } = useForm<CompanyAccountForm>({ resolver: zodResolver(schema), defaultValues: emptyValues })

  useEffect(() => {
    if (!open) return
    reset(account ? { code: account.code, name: account.name } : emptyValues)
  }, [open, account, reset])

  function onSubmit(values: CompanyAccountForm) {
    saveAccount.mutate(
      {
        ...(account ? { id: account.id } : {}),
        code: values.code,
        name: values.name,
      },
      {
        onSuccess: () => {
          toast.success(account ? 'Account updated' : 'Account created')
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
      title={account ? 'Edit company account' : 'New company account'}
      description="A company bank account, by its reference code and a name people recognise."
    >
      <form onSubmit={handleSubmit(onSubmit)} className="grid gap-4">
        <div className="grid gap-1.5">
          <Label htmlFor="code">Account code</Label>
          {/* Codes read as identifiers, so they get a monospace field — the
              same treatment supplier types get. */}
          <Input
            id="code"
            className="font-mono"
            placeholder="BK020303030030"
            {...register('code')}
          />
          {errors.code ? (
            <p className="text-sm text-destructive">{errors.code.message}</p>
          ) : (
            <p className="text-xs text-muted-foreground">The bank's reference for the account.</p>
          )}
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="name">Account name</Label>
          <Input id="name" placeholder="BK Account" {...register('name')} />
          {errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" disabled={saveAccount.isPending}>
            {saveAccount.isPending ? 'Saving…' : account ? 'Save changes' : 'Create account'}
          </Button>
        </DialogFooter>
      </form>
    </FormDialog>
  )
}
