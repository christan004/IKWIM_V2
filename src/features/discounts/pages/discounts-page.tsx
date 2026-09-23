import { useState } from 'react'
import { ChevronRight, Pencil, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { DataTable, type DataTableColumn } from '@/components/data-table'
import { NoAccess } from '@/components/no-access'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { PERMISSION_MODULES, usePermissions } from '@/hooks/use-permissions'
import { DiscountFormDialog } from '@/features/discounts/components/discount-form-dialog'
import {
  useDeleteDiscount,
  useDiscounts,
  useToggleDiscountStatus,
} from '@/features/discounts/use-discounts'
import { cn } from '@/lib/utils'
import { errorCode, errorMessage } from '@/lib/error-message'
import type { Discount } from '@/api/types'

/** Values arrive as strings, so they are parsed before formatting. */
function formatValue(value: number | string | undefined): string {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed.toLocaleString() : '—'
}

/** `2026-09-01T00:00:00.000Z` → `1 Sep 2026`. */
function formatDate(iso: string | undefined): string {
  if (!iso) return '—'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
}

/** Whether today falls inside the discount's window. */
function isLive(discount: Discount): boolean {
  const now = Date.now()
  const from = new Date(discount.validFrom).getTime()
  const to = new Date(discount.validTo).getTime()
  return discount.status === 'active' && now >= from && now <= to
}

export function DiscountsPage() {
  const permissions = usePermissions()
  const { canRead, canCreate, canEdit, canDelete } = permissions.forModule(
    PERMISSION_MODULES.discounts,
  )
  // Each is gated on its own module's permission, not the discounts one.
  const canReadClients = permissions.forModule(PERMISSION_MODULES.clients).canRead
  const canReadSites = permissions.forModule(PERMISSION_MODULES.pss).canRead

  const { discounts, isLoading, isError, error } = useDiscounts({ enabled: canRead })
  const toggleStatus = useToggleDiscountStatus()
  const deleteDiscount = useDeleteDiscount()

  const [createOpen, setCreateOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<Discount | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Discount | null>(null)
  /** Which row is mid-request, so its switch cannot be flipped twice. */
  const [togglingId, setTogglingId] = useState<string | null>(null)

  const labelOf = (row: Discount) =>
    row.client?.name ?? (row.type === 'ranging' ? 'Volume tiers' : 'Unnamed')

  function handleToggle(row: Discount) {
    setTogglingId(row.id)
    toggleStatus.mutate(row.id, {
      onSuccess: (updated) => {
        const nowActive = (updated?.status ?? row.status) === 'active'
        toast.success(`Discount ${nowActive ? 'activated' : 'deactivated'}`)
      },
      onError: (err) => toast.error(errorMessage(err)),
      onSettled: () => setTogglingId(null),
    })
  }

  function handleDelete() {
    if (!deleteTarget) return
    deleteDiscount.mutate(deleteTarget.id, {
      onSuccess: () => {
        toast.success('Discount deleted')
        setDeleteTarget(null)
      },
      onError: (err) => toast.error(errorMessage(err)),
    })
  }

  const columns: DataTableColumn<Discount>[] = [
    {
      header: 'Applies to',
      cell: (row) => (
        <div className="flex items-center gap-2">
          {/* Only a ranging discount has tiers to reveal. */}
          {row.type === 'ranging' ? (
            <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" />
          ) : (
            <span className="size-3.5 shrink-0" />
          )}
          <div>
            <span className="font-medium">{labelOf(row)}</span>
            <span className="block text-xs text-muted-foreground">
              {row.site?.name ?? 'All sites'}
            </span>
          </div>
        </div>
      ),
    },
    {
      header: 'Type',
      cell: (row) => (
        <Badge variant={row.type === 'fixed' ? 'default' : 'secondary'} className="font-normal">
          {row.type}
        </Badge>
      ),
    },
    {
      header: 'Discount',
      // A ranging discount's real figures live in its tiers, so the top-level
      // `value` (always 0) would be misleading here.
      cell: (row) => {
        if (row.type === 'ranging') {
          const tiers = row.rangingDiscounts ?? []
          if (tiers.length === 0) {
            return <span className="text-xs text-muted-foreground">No tiers</span>
          }
          const amounts = tiers.map((t) => Number(t.amount)).filter(Number.isFinite)
          const low = Math.min(...amounts)
          const high = Math.max(...amounts)
          return (
            <span className="tabular-nums">
              {low === high ? formatValue(low) : `${formatValue(low)}–${formatValue(high)}`}
              <span className="ml-1 text-xs font-normal text-muted-foreground">
                over {tiers.length} {tiers.length === 1 ? 'tier' : 'tiers'}
              </span>
            </span>
          )
        }
        return <span className="font-medium tabular-nums">{formatValue(row.value)}</span>
      },
    },
    {
      header: 'Valid',
      cell: (row) => (
        <div>
          <span className="text-sm">
            {formatDate(row.validFrom)} → {formatDate(row.validTo)}
          </span>
          {/* A discount can be active yet outside its window, which is the
              difference between "switched on" and "actually applying". */}
          {row.status === 'active' && !isLive(row) && (
            <span className="block text-xs text-muted-foreground">Outside its dates</span>
          )}
        </div>
      ),
    },
    {
      header: 'Status',
      cell: (row) => {
        const isActive = row.status === 'active'
        // The endpoint flips rather than sets, so a second call while one is in
        // flight would silently undo the first.
        const isBusy = togglingId === row.id

        // Changing status is an edit; without it the state is read-only.
        if (!canEdit) {
          return (
            <Badge variant={isActive ? 'default' : 'secondary'}>
              {isActive ? 'Active' : 'Inactive'}
            </Badge>
          )
        }

        return (
          <div className="flex items-center gap-2">
            <Switch
              checked={isActive}
              disabled={isBusy}
              onCheckedChange={() => handleToggle(row)}
              aria-label={`${isActive ? 'Deactivate' : 'Activate'} discount`}
            />
            <span className={cn('text-sm', !isActive && 'text-muted-foreground')}>
              {isActive ? 'Active' : 'Inactive'}
            </span>
          </div>
        )
      },
    },
    ...(canEdit || canDelete
      ? [
          {
            header: '',
            className: 'text-right',
            cell: (row: Discount) => (
              <div
                // The row toggles its tiers, so the actions must not also
                // expand it on their way through.
                className="flex justify-end gap-1"
                onClick={(event) => event.stopPropagation()}
              >
                {canEdit && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setEditTarget(row)}
                    title="Edit discount"
                  >
                    <Pencil className="size-3.5" />
                  </Button>
                )}
                {canDelete && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setDeleteTarget(row)}
                    title="Delete discount"
                  >
                    <Trash2 className="size-3.5 text-destructive" />
                  </Button>
                )}
              </div>
            ),
          },
        ]
      : []),
  ]

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight">Discounts</h1>
          <p className="text-sm text-muted-foreground">
            A fixed rate for one client, or rates that change with volume. Ranging discounts
            expand to show their tiers.
          </p>
        </div>
        {canCreate && (
          <Button onClick={() => setCreateOpen(true)}>
            <Plus />
            New discount
          </Button>
        )}
      </div>

      {!canRead ? (
        <NoAccess resource="discounts" />
      ) : isError && errorCode(error) === 'FORBIDDEN' ? (
        <NoAccess resource="discounts" variant="rejected" permission="discounts.read" />
      ) : isError ? (
        <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {errorMessage(error)}
        </p>
      ) : (
        <DataTable
          columns={columns}
          data={discounts}
          rowKey={(row) => row.id}
          isLoading={isLoading}
          emptyMessage="No discounts yet. Create one to give a client a rate."
          getSearchText={(row) =>
            `${labelOf(row)} ${row.type} ${row.site?.name ?? ''} ${row.status}`
          }
          searchPlaceholder="Search discounts…"
          pageSize={15}
          /*
           * Only a ranging discount has anything to reveal. Returning null for
           * a fixed one leaves that row un-expandable, so the chevron and the
           * behaviour agree.
           */
          renderExpanded={(row) => {
            const tiers = row.rangingDiscounts ?? []
            if (row.type !== 'ranging' || tiers.length === 0) return null

            return (
              <div className="grid gap-1.5 px-4 py-3">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Volume tiers
                </p>
                {[...tiers]
                  // Lowest band first — the order they apply in.
                  .sort((a, b) => Number(a.from) - Number(b.from))
                  .map((tier, index) => (
                    <div
                      key={tier.id ?? index}
                      className="flex flex-wrap items-baseline gap-2 text-xs"
                    >
                      <span className="tabular-nums font-medium">
                        {formatValue(tier.from)} – {formatValue(tier.to)}
                      </span>
                      <span className="text-muted-foreground">→</span>
                      <span className="tabular-nums font-medium">{formatValue(tier.amount)}</span>
                      {tier.status && (
                        <Badge variant="outline" className="font-normal">
                          {tier.status}
                        </Badge>
                      )}
                    </div>
                  ))}
              </div>
            )
          }}
        />
      )}

      <DiscountFormDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        canReadClients={canReadClients}
        canReadSites={canReadSites}
      />

      <DiscountFormDialog
        open={editTarget !== null}
        onOpenChange={(open) => {
          if (!open) setEditTarget(null)
        }}
        discount={editTarget}
        canReadClients={canReadClients}
        canReadSites={canReadSites}
      />

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null)
        }}
        title="Delete discount?"
        description={
          deleteTarget
            ? `The ${deleteTarget.type} discount for ${labelOf(
                deleteTarget,
              )} will be removed permanently. Deactivate instead to keep the record.`
            : ''
        }
        confirmLabel="Delete"
        variant="destructive"
        isLoading={deleteDiscount.isPending}
        onConfirm={handleDelete}
      />
    </div>
  )
}
