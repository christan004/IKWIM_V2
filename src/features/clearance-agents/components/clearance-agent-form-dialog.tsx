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
import { useSaveClearanceAgent } from '@/features/clearance-agents/use-clearance-agents'
import type { ClearanceAgent } from '@/api/types'

const schema = z.object({
  names: z.string().min(1, 'Name is required'),
  // Kept as a string for the input, parsed on submit — the API wants a number
  // and rejects `NaN`.
  fees: z
    .string()
    .min(1, 'Fee is required')
    .refine((v) => Number.isFinite(Number(v)), 'Must be a number')
    // `0` is accepted by the API; only negatives are rejected.
    .refine((v) => Number(v) >= 0, 'Cannot be negative'),
})

type ClearanceAgentForm = z.infer<typeof schema>

const emptyValues: ClearanceAgentForm = { names: '', fees: '' }

const FIELD_NAMES = ['names', 'fees'] as const

/**
 * Creates or edits a clearing agent.
 *
 * Both fields are **required on update too** — a partial body is rejected — so
 * the edit path sends the whole record rather than a patch.
 */
export function ClearanceAgentFormDialog({
  open,
  onOpenChange,
  agent,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Present when editing; the list row carries every field, so no fetch. */
  agent?: ClearanceAgent | null
}) {
  const saveAgent = useSaveClearanceAgent()

  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors },
  } = useForm<ClearanceAgentForm>({ resolver: zodResolver(schema), defaultValues: emptyValues })

  useEffect(() => {
    if (!open) return
    reset(
      agent
        ? // `fees` comes back as a string, so it is normalised rather than
          // assumed to be one shape or the other.
          { names: agent.names, fees: String(agent.fees ?? '') }
        : emptyValues,
    )
  }, [open, agent, reset])

  function onSubmit(values: ClearanceAgentForm) {
    saveAgent.mutate(
      {
        ...(agent ? { id: agent.id } : {}),
        names: values.names,
        // Sent as a number: the API validates the type, though it does coerce a
        // numeric string.
        fees: Number(values.fees),
      },
      {
        onSuccess: () => {
          toast.success(agent ? 'Clearance agent updated' : 'Clearance agent created')
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
      title={agent ? 'Edit clearance agent' : 'New clearance agent'}
      description="An agent who clears stock through customs, and the fee they charge."
    >
      <form onSubmit={handleSubmit(onSubmit)} className="grid gap-4">
        <div className="grid gap-1.5">
          <Label htmlFor="names">Name</Label>
          <Input id="names" placeholder="Pascal" {...register('names')} />
          {errors.names && <p className="text-sm text-destructive">{errors.names.message}</p>}
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="fees">Fee</Label>
          <Input id="fees" type="number" min="0" step="any" placeholder="2000" {...register('fees')} />
          {errors.fees ? (
            <p className="text-sm text-destructive">{errors.fees.message}</p>
          ) : (
            <p className="text-xs text-muted-foreground">What the agent charges per clearance.</p>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" disabled={saveAgent.isPending}>
            {saveAgent.isPending ? 'Saving…' : agent ? 'Save changes' : 'Create agent'}
          </Button>
        </DialogFooter>
      </form>
    </FormDialog>
  )
}
