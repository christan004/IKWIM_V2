import { useState } from 'react'
import { Pencil, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { DataTable, type DataTableColumn } from '@/components/data-table'
import { NoAccess } from '@/components/no-access'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { PERMISSION_MODULES, usePermissions } from '@/hooks/use-permissions'
import { OrderPlanFormDialog } from '@/features/orders/components/order-plan-form-dialog'
import { useOrderPlans, useSetOrderPlanStatus } from '@/features/orders/use-order-plans'
import { errorCode, errorMessage } from '@/lib/error-message'
import { ORDER_PLAN_STATUSES, type OrderPlan, type OrderPlanStatus } from '@/api/types'

const STATUS_LABEL: Record<OrderPlanStatus, string> = {
  active: 'Active',
  closed: 'Closed',
  terminated: 'Terminated',
  force_closed: 'Force closed',
}

const STATUS_VARIANT: Record<OrderPlanStatus, 'default' | 'secondary' | 'outline'> = {
  active: 'default',
  closed: 'secondary',
  terminated: 'outline',
  force_closed: 'outline',
}

/**
 * Closing or terminating a plan is not obviously reversible, so those changes
 * are confirmed. Re-activating is not.
 */
const NEEDS_CONFIRMATION: OrderPlanStatus[] = ['closed', 'terminated', 'force_closed']

/**
 * Formats the UTC calendar day the API stores. Parsing through `Date` and
 * reading local getters would shift the day in timezones behind UTC, so the
 * date part is taken from the ISO string directly.
 */
function formatDate(iso: string): string {
  const [year, month, day] = iso.slice(0, 10).split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString(undefined, {
    timeZone: 'UTC',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

export function OrderPlansPage() {
  const { canRead, canCreate, canEdit } = usePermissions().forModule(
    PERMISSION_MODULES.orderPlans,
  )
  // Skip the request entirely when the user may not read the resource.
  const { plans, isLoading, isError, error } = useOrderPlans({ enabled: canRead })
  const setStatus = useSetOrderPlanStatus()

  const [createOpen, setCreateOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<OrderPlan | null>(null)
  const [pending, setPending] = useState<{ plan: OrderPlan; status: OrderPlanStatus } | null>(
    null,
  )
  /** Which row is mid-request, so its dropdown is disabled while saving. */
  const [savingId, setSavingId] = useState<string | null>(null)

  function applyStatus(plan: OrderPlan, status: OrderPlanStatus) {
    setSavingId(plan.id)
    setStatus.mutate(
      { id: plan.id, status },
      {
        onSuccess: () => {
          toast.success(`${plan.name} set to ${STATUS_LABEL[status].toLowerCase()}`)
          setPending(null)
        },
        onError: (err) => toast.error(errorMessage(err)),
        onSettled: () => setSavingId(null),
      },
    )
  }

  function requestStatusChange(plan: OrderPlan, status: OrderPlanStatus) {
    if (status === plan.status) return
    if (NEEDS_CONFIRMATION.includes(status)) {
      setPending({ plan, status })
      return
    }
    applyStatus(plan, status)
  }

  const columns: DataTableColumn<OrderPlan>[] = [
    {
      header: 'Name',
      cell: (plan) => <span className="font-medium">{plan.name}</span>,
    },
    {
      header: 'Period',
      cell: (plan) =>
        plan.startDate && plan.endDate ? (
          <span className="text-sm text-muted-foreground">
            {formatDate(plan.startDate)} – {formatDate(plan.endDate)}
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      header: 'Status',
      cell: (plan) => {
        // Four states rather than a boolean, so the status is chosen from a
        // list instead of toggled.
        if (!canEdit) {
          return <Badge variant={STATUS_VARIANT[plan.status]}>{STATUS_LABEL[plan.status]}</Badge>
        }

        return (
          <Select
            value={plan.status}
            disabled={savingId === plan.id}
            onValueChange={(value) => requestStatusChange(plan, value as OrderPlanStatus)}
          >
            <SelectTrigger className="h-8 w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ORDER_PLAN_STATUSES.map((status) => (
                <SelectItem key={status} value={status}>
                  {STATUS_LABEL[status]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )
      },
    },
    ...(canEdit
      ? [
          {
            header: '',
            className: 'text-right',
            // There is no delete endpoint, so editing is the only correction path.
            cell: (plan: OrderPlan) => (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setEditTarget(plan)}
                title="Edit plan"
              >
                <Pencil className="size-3.5" />
              </Button>
            ),
          },
        ]
      : []),
  ]

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight">Order plans</h1>
          <p className="text-sm text-muted-foreground">
            Named periods that orders are grouped into.
          </p>
        </div>
        {canCreate && (
          <Button onClick={() => setCreateOpen(true)}>
            <Plus />
            New plan
          </Button>
        )}
      </div>

      {!canRead ? (
        <NoAccess resource="order plans" />
      ) : isError && errorCode(error) === 'FORBIDDEN' ? (
        // The role grants orders.plan.read, but the API refused anyway — a
        // server-side gating mismatch, not a missing grant.
        <NoAccess resource="order plans" variant="rejected" permission="orders.plan.read" />
      ) : isError ? (
        <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {errorMessage(error)}
        </p>
      ) : (
        <DataTable
          columns={columns}
          data={plans}
          rowKey={(plan) => plan.id}
          isLoading={isLoading}
          emptyMessage="No order plans yet. Create the first one to start grouping orders."
          getSearchText={(plan) => `${plan.name} ${plan.status}`}
          searchPlaceholder="Search plans…"
          getIsActive={(plan) => plan.status === 'active'}
          pageSize={15}
        />
      )}

      <OrderPlanFormDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        existingPlans={plans}
      />

      {/* Keyed by id so the form re-seeds when a different plan is opened. */}
      <OrderPlanFormDialog
        key={editTarget?.id ?? 'edit'}
        open={Boolean(editTarget)}
        onOpenChange={(open) => !open && setEditTarget(null)}
        plan={editTarget}
        existingPlans={plans}
      />

      <ConfirmDialog
        open={Boolean(pending)}
        onOpenChange={(open) => !open && setPending(null)}
        title={
          pending
            ? `Set "${pending.plan.name}" to ${STATUS_LABEL[pending.status].toLowerCase()}?`
            : ''
        }
        description="Orders may no longer be added to this plan. You can set it back to active afterwards."
        confirmLabel={pending ? STATUS_LABEL[pending.status] : 'Confirm'}
        variant="destructive"
        onConfirm={() => pending && applyStatus(pending.plan, pending.status)}
        isLoading={setStatus.isPending}
      />
    </div>
  )
}
