import { useState } from 'react'
import { FileText } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
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
import { useSetT1Status, useT1Validations } from '@/features/t1-validation/use-t1-validation'
import { useUnits } from '@/features/units/use-units'
import { useItems } from '@/features/items/use-items'
import { errorCode, errorMessage } from '@/lib/error-message'
import {
  T1_STATUSES,
  nominationQuantity,
  type T1ExtraValidation,
  type T1Status,
  type T1Validation,
} from '@/api/types'

/** Quantities arrive as strings here, so both are parsed before formatting. */
function formatQty(value: string | number | undefined): string {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed.toLocaleString() : (String(value ?? '') || '—')
}

const STATUS_LABEL: Record<T1Status, string> = {
  pending: 'Pending',
  confirmed: 'Confirmed',
  cancelled: 'Cancelled',
}

const STATUS_VARIANT: Record<T1Status, 'default' | 'secondary' | 'outline'> = {
  pending: 'secondary',
  confirmed: 'default',
  cancelled: 'outline',
}

/** Confirming or cancelling a customs check is a decision, so it is confirmed. */
const NEEDS_CONFIRMATION: T1Status[] = ['confirmed', 'cancelled']

/**
 * Only render a document link the browser can actually open — the API has
 * produced concatenated values like `https://host.rwfile:///home/…`. Shared
 * logic with cargo; see the note there for why the raw string is checked.
 */
function isOpenableUrl(url: string | undefined): boolean {
  if (!url) return false
  if (/^[a-z][a-z0-9+.-]*:\/\/.*[a-z][a-z0-9+.-]*:\/\//i.test(url)) return false
  try {
    const { protocol } = new URL(url)
    return protocol === 'http:' || protocol === 'https:'
  } catch {
    return false
  }
}

export function T1ValidationPage() {
  const permissions = usePermissions()
  // Dotted module code — `t1.validation`, not `t1_validation`. The permission
  // helper already handles these; `suppliers.type` is the precedent.
  // `canEdit` still gates the per-check status control, which is a separate
  // endpoint from create.
  const { canRead, canEdit } = permissions.forModule(PERMISSION_MODULES.t1Validation)

  // The nested item carries a bare `baseUnitId` and needs the items tree for
  // its parent, so each list is read and gated on its own permission.
  const canReadUnits = permissions.forModule(PERMISSION_MODULES.units).canRead
  const canReadItems = permissions.forModule(PERMISSION_MODULES.items).canRead

  const { validations, isLoading, isError, error } = useT1Validations({ enabled: canRead })
  const { units } = useUnits({ enabled: canRead && canReadUnits })
  const { rows: itemRows } = useItems({ enabled: canRead && canReadItems })
  const setStatus = useSetT1Status()

  const [pending, setPending] = useState<{ row: T1ExtraValidation; status: T1Status } | null>(
    null,
  )
  /** Which child record is mid-request, so its dropdown is disabled while saving. */
  const [savingId, setSavingId] = useState<string | null>(null)

  function applyStatus(row: T1ExtraValidation, status: T1Status) {
    setSavingId(row.id)
    setStatus.mutate(
      { id: row.id, status },
      {
        onSuccess: () => {
          toast.success(`${row.customOffice} set to ${STATUS_LABEL[status].toLowerCase()}`)
          setPending(null)
        },
        onError: (err) => toast.error(errorMessage(err)),
        onSettled: () => setSavingId(null),
      },
    )
  }

  function requestStatusChange(row: T1ExtraValidation, status: T1Status) {
    if (status === row.status) return
    if (NEEDS_CONFIRMATION.includes(status)) {
      setPending({ row, status })
      return
    }
    applyStatus(row, status)
  }

  const columns: DataTableColumn<T1Validation>[] = [
    {
      header: 'Item',
      // The nomination nests its stock item, so what is in transit leads.
      // ⚠️ This nomination is trimmed — no `destination`, no `driverVehicle` —
      // so neither is rendered here; see the note on `T1Validation`.
      cell: (row) => {
        const item = row.nomination?.stock?.item
        if (!item) return <span className="text-muted-foreground">—</span>
        const parentName = itemRows.find((r) => r.id === item.id)?.parentName
        return (
          <div>
            <span className="font-medium">{item.name}</span>
            {parentName && (
              <span className="block text-xs text-muted-foreground">{parentName}</span>
            )}
          </div>
        )
      },
    },
    {
      header: 'Quantity',
      cell: (row) => {
        // The nested item carries a bare `baseUnitId`, so the unit is resolved.
        const code = units.find((u) => u.id === row.nomination?.stock?.item?.baseUnitId)?.code
        // Two figures, as on the nominations page — the nested nomination
        // followed the same rename, so there is no plain `quantity` any more.
        const corrected = nominationQuantity(row.nomination)
        const ambient = Number(row.nomination?.ambQuantity)
        if (!Number.isFinite(corrected)) {
          return <span className="text-muted-foreground">—</span>
        }
        // Ambient is only worth a second line when it differs from corrected.
        const differs = Number.isFinite(ambient) && ambient !== corrected
        return (
          <div className="tabular-nums">
            <span className="font-medium">
              {formatQty(corrected)}
              {code && (
                <span className="ml-1 text-xs font-normal text-muted-foreground">{code}</span>
              )}
            </span>
            <span className="block text-xs font-normal text-muted-foreground">
              at 20&nbsp;°C
              {differs ? ` · ${formatQty(row.nomination?.ambQuantity)} ambient` : ''}
            </span>
          </div>
        )
      },
    },
    {
      header: 'Exporting from',
      cell: (row) => <span className="text-sm">{row.exportingCountry}</span>,
    },
    {
      header: 'Status',
      // A T1 has no status of its own — it is the roll-up of its customs
      // checks, so the overall state is summarised rather than left to be
      // inferred from the list beside it.
      cell: (row) => {
        const checks = row.extraValidations ?? []
        if (checks.length === 0) return <span className="text-muted-foreground">—</span>

        // Any cancellation dominates; otherwise all-confirmed clears it, and
        // anything else is still in progress.
        const overall: T1Status = checks.some((c) => c.status === 'cancelled')
          ? 'cancelled'
          : checks.every((c) => c.status === 'confirmed')
            ? 'confirmed'
            : 'pending'

        const confirmed = checks.filter((c) => c.status === 'confirmed').length

        return (
          <div>
            <Badge variant={STATUS_VARIANT[overall]}>{STATUS_LABEL[overall]}</Badge>
            {checks.length > 1 && (
              <span className="block text-xs text-muted-foreground">
                {confirmed} of {checks.length} confirmed
              </span>
            )}
          </div>
        )
      },
    },
    {
      header: 'Customs checks',
      // The status lives on these children, not on the parent — so each one
      // gets its own row and its own dropdown. The Status column beside this
      // rolls them up.
      cell: (row) => {
        const extras = row.extraValidations ?? []
        if (extras.length === 0) {
          return <span className="text-sm text-muted-foreground">None</span>
        }

        return (
          <div className="grid gap-2">
            {extras.map((extra) => (
              <div key={extra.id} className="flex flex-wrap items-center gap-2">
                <div className="min-w-32">
                  <span className="text-sm">{extra.customOffice}</span>
                  <span className="block font-mono text-xs text-muted-foreground">
                    Transit {extra.transitNumbering}
                  </span>
                </div>
                {canEdit ? (
                  <Select
                    value={extra.status}
                    disabled={savingId === extra.id}
                    onValueChange={(value) => requestStatusChange(extra, value as T1Status)}
                  >
                    <SelectTrigger className="h-8 w-36">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {T1_STATUSES.map((status) => (
                        <SelectItem key={status} value={status}>
                          {STATUS_LABEL[status]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Badge variant={STATUS_VARIANT[extra.status]}>
                    {STATUS_LABEL[extra.status]}
                  </Badge>
                )}
              </div>
            ))}
          </div>
        )
      },
    },
    {
      header: 'Document',
      className: 'text-right',
      cell: (row) =>
        isOpenableUrl(row.supportingDocUrl) ? (
          <a
            href={row.supportingDocUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 text-xs text-primary underline-offset-2 hover:underline"
          >
            <FileText className="size-3.5" />
            View
          </a>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        ),
    },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight">T1 validation</h1>
        <p className="text-sm text-muted-foreground">
          Transit validations raised against nominations. New validations are raised from
          the PFI page, against the nomination the invoice covers.
        </p>
      </div>

      {!canRead ? (
        <NoAccess resource="T1 validations" />
      ) : isError && errorCode(error) === 'FORBIDDEN' ? (
        <NoAccess resource="T1 validations" variant="rejected" permission="t1.validation.read" />
      ) : isError ? (
        <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {errorMessage(error)}
        </p>
      ) : (
        <DataTable
          columns={columns}
          data={validations}
          rowKey={(row) => row.id}
          isLoading={isLoading}
          emptyMessage="No T1 validations yet. Raise one from the PFI page, against the nomination the invoice covers."
          getSearchText={(row) =>
            `${row.exportingCountry} ${row.nomination?.stock?.item?.name ?? ''} ${(
              row.extraValidations ?? []
            )
              .map((e) => `${e.customOffice} ${e.transitNumbering}`)
              .join(' ')}`
          }
          searchPlaceholder="Search validations…"
          pageSize={15}
        />
      )}

      <ConfirmDialog
        open={Boolean(pending)}
        onOpenChange={(open) => !open && setPending(null)}
        title={
          pending
            ? `Mark ${pending.row.customOffice} as ${STATUS_LABEL[pending.status].toLowerCase()}?`
            : ''
        }
        description="You can change the status again afterwards."
        confirmLabel={pending ? STATUS_LABEL[pending.status] : 'Confirm'}
        variant={pending?.status === 'cancelled' ? 'destructive' : 'default'}
        onConfirm={() => pending && applyStatus(pending.row, pending.status)}
        isLoading={setStatus.isPending}
      />
    </div>
  )
}
