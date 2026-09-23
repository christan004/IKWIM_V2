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
import { useCreateWalletMovement } from '@/features/client-wallets/use-client-wallets'
import { useCompanyAccounts } from '@/features/company-accounts/use-company-accounts'
import {
  WALLET_MOVEMENT_TYPES,
  type ClientWallet,
  type WalletMovementType,
} from '@/api/types'

/** Only a deposit needs a company account and a reference. */
const REQUIRES_ACCOUNT: WalletMovementType[] = ['DEPOSIT']

const schema = z
  .object({
    type: z.enum(WALLET_MOVEMENT_TYPES),
    // Kept as a string throughout: the API takes a string and rejects a number.
    amount: z
      .string()
      .min(1, 'Amount is required')
      .refine((v) => Number(v) > 0, 'Must be greater than zero')
      // The API allows at most 2 decimal places.
      .refine((v) => /^\d+(\.\d{1,2})?$/.test(v), 'At most 2 decimal places'),
    accountId: z.string(),
    referenceId: z.string(),
  })
  .superRefine((values, ctx) => {
    // Mirrors the API's own rule, which names the deposit case explicitly.
    if (!REQUIRES_ACCOUNT.includes(values.type)) return
    if (values.accountId === '') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['accountId'],
        message: 'Company account is required for a deposit',
      })
    }
    if (values.referenceId.trim() === '') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['referenceId'],
        message: 'Reference is required for a deposit',
      })
    }
  })

type MovementForm = z.infer<typeof schema>

const emptyValues: MovementForm = {
  type: 'DEPOSIT',
  amount: '',
  accountId: '',
  referenceId: '',
}

const FIELD_NAMES = ['type', 'amount', 'accountId', 'referenceId'] as const

/** Which way each type moves the balance, so the effect is stated up front. */
const TYPE_DIRECTION: Record<WalletMovementType, 'in' | 'out'> = {
  DEPOSIT: 'in',
  REFUND: 'in',
  LOAN: 'in',
  PAYMENT: 'out',
  WITHDRAWAL: 'out',
  TRANSFER: 'out',
  // An adjustment can go either way; treated as neutral rather than guessed.
  ADJUSTMENT: 'in',
}

const TYPE_LABELS: Record<WalletMovementType, string> = {
  DEPOSIT: 'Deposit — money paid in',
  PAYMENT: 'Payment — money spent',
  REFUND: 'Refund — money returned',
  LOAN: 'Loan — credit extended',
  WITHDRAWAL: 'Withdrawal — money taken out',
  TRANSFER: 'Transfer — moved elsewhere',
  ADJUSTMENT: 'Adjustment — correction',
}

/**
 * Records a movement against one wallet.
 */
export function WalletMovementDialog({
  open,
  onOpenChange,
  wallet,
  canReadAccounts,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** The wallet being credited or debited. `null` closes the dialog. */
  wallet: ClientWallet | null
  /** Gated on `company.account.read`, not the wallet permission. */
  canReadAccounts: boolean
}) {
  const createMovement = useCreateWalletMovement()
  const { accounts } = useCompanyAccounts({ enabled: canReadAccounts })

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    setError,
    watch,
    formState: { errors },
  } = useForm<MovementForm>({ resolver: zodResolver(schema), defaultValues: emptyValues })

  const type = watch('type')
  const accountId = watch('accountId')
  const amount = Number(watch('amount'))

  const needsAccount = REQUIRES_ACCOUNT.includes(type)

  useEffect(() => {
    if (!open) return
    reset(emptyValues)
  }, [open, reset])

  /** An inactive account cannot take new money, but a chosen one stays visible. */
  const selectableAccounts = accounts.filter(
    (a) => a.status === 'active' || a.id === accountId,
  )

  /** What the wallet would hold afterwards, so the effect is visible. */
  const balance = Number(wallet?.amount)
  const projected =
    Number.isFinite(balance) && Number.isFinite(amount) && amount > 0
      ? balance + (TYPE_DIRECTION[type] === 'out' ? -amount : amount)
      : null

  function onSubmit(values: MovementForm) {
    if (!wallet) return

    createMovement.mutate(
      {
        walletId: wallet.id,
        type: values.type,
        amount: values.amount,
        // Omitted entirely for the six types that do not take them — the API
        // requires both only for a deposit.
        ...(needsAccount && values.accountId ? { accountId: values.accountId } : {}),
        ...(needsAccount && values.referenceId ? { referenceId: values.referenceId } : {}),
      },
      {
        onSuccess: () => {
          toast.success('Movement recorded')
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
      title="Record movement"
      description="Money in or out of this client's wallet."
    >
      <form onSubmit={handleSubmit(onSubmit)} className="grid gap-4">
        {/* Read-only: the wallet comes from the row the action was taken from. */}
        <div className="rounded-md border bg-muted/40 px-3 py-2">
          {wallet ? (
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <div>
                <span className="text-xs text-muted-foreground">Wallet</span>
                <p className="text-sm font-medium">{wallet.client?.name ?? 'Client'}</p>
                {wallet.client?.clientCode && (
                  <p className="font-mono text-xs text-muted-foreground">
                    {wallet.client.clientCode}
                  </p>
                )}
              </div>
              <div className="text-right">
                <span className="text-xs text-muted-foreground">Balance</span>
                <p className="text-sm font-medium tabular-nums">
                  {Number.isFinite(balance) ? balance.toLocaleString() : '—'}
                </p>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No wallet selected.</p>
          )}
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="type">Type</Label>
          <Select
            value={type}
            onValueChange={(v) =>
              setValue('type', v as WalletMovementType, { shouldValidate: true })
            }
          >
            <SelectTrigger id="type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {WALLET_MOVEMENT_TYPES.map((value) => (
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
              {needsAccount
                ? 'A deposit needs a company account and a reference.'
                : 'No account or reference needed for this type.'}
            </p>
          )}
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="amount">Amount</Label>
          <Input
            id="amount"
            type="number"
            min="0"
            step="0.01"
            placeholder="1250.50"
            {...register('amount')}
          />
          {errors.amount ? (
            <p className="text-sm text-destructive">{errors.amount.message}</p>
          ) : (
            projected !== null && (
              // The arithmetic is shown so a wrong type or figure is visible
              // before it is sent.
              <p className="text-xs text-muted-foreground">
                {balance.toLocaleString()} {TYPE_DIRECTION[type] === 'out' ? '−' : '+'}{' '}
                {amount.toLocaleString()} ={' '}
                <span className="font-medium text-foreground">
                  {projected.toLocaleString()}
                </span>
              </p>
            )
          )}
        </div>

        {/* Only a deposit takes these — the other six reject nothing but are
            not asked for either. */}
        {needsAccount && (
          <>
            <div className="grid gap-1.5">
              <Label htmlFor="accountId">Company account</Label>
              <Select
                value={accountId}
                onValueChange={(v) => setValue('accountId', v, { shouldValidate: true })}
              >
                <SelectTrigger id="accountId">
                  <SelectValue placeholder="Select the account paid into" />
                </SelectTrigger>
                <SelectContent>
                  {selectableAccounts.map((account) => (
                    <SelectItem key={account.id} value={account.id}>
                      <span className="font-mono">{account.code}</span>
                      <span className="text-muted-foreground"> · {account.name}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.accountId ? (
                <p className="text-sm text-destructive">{errors.accountId.message}</p>
              ) : selectableAccounts.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  {canReadAccounts
                    ? 'No company accounts yet — create one first.'
                    : 'You cannot read company accounts.'}
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">Where the money was paid in.</p>
              )}
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="referenceId">Reference</Label>
              <Input
                id="referenceId"
                className="font-mono"
                placeholder="DEP-001"
                {...register('referenceId')}
              />
              {errors.referenceId ? (
                <p className="text-sm text-destructive">{errors.referenceId.message}</p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  The bank or receipt reference for this payment.
                </p>
              )}
            </div>
          </>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" disabled={createMovement.isPending || !wallet}>
            {createMovement.isPending ? 'Recording…' : 'Record movement'}
          </Button>
        </DialogFooter>
      </form>
    </FormDialog>
  )
}
