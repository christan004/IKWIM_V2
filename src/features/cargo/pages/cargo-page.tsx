import { useState } from 'react'
import { FileText, Pencil, Plus, ReceiptText } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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
import { CargoFormDialog } from '@/features/cargo/components/cargo-form-dialog'
import { useCargoList, useSetCargoStatus } from '@/features/cargo/use-cargo'
import { CargoInvoiceFormDialog } from '@/features/cargo-invoices/components/cargo-invoice-form-dialog'
import { CargoInvoiceList } from '@/features/cargo-invoices/components/cargo-invoice-list'
import { useDeleteCargoInvoice } from '@/features/cargo-invoices/use-cargo-invoices'
import { errorCode, errorMessage } from '@/lib/error-message'
import {
  CARGO_STATUSES,
  type Cargo,
  type CargoInvoice,
  type CargoStatus,
} from '@/api/types'

const STATUS_LABEL: Record<CargoStatus, string> = {
  pending: 'Pending',
  approved: 'Approved',
  cancelled: 'Cancelled',
}

const STATUS_VARIANT: Record<CargoStatus, 'default' | 'secondary' | 'outline'> = {
  pending: 'secondary',
  approved: 'default',
  cancelled: 'outline',
}

/**
 * Approving or cancelling is a decision, so it is confirmed — and the API
 * records *when* it was taken, so the confirmation asks for that date.
 */
const NEEDS_CONFIRMATION: CargoStatus[] = ['approved', 'cancelled']

/**
 * Only pending cargo can be edited.
 *
 * Approving raises stock against the shipment and cancelling withdraws it —
 * either way the record has been acted on, so amending its quantity afterwards
 * would put the cargo and its stock out of step.
 */
function isEditable(status: CargoStatus): boolean {
  return status === 'pending'
}

/** Today as `YYYY-MM-DD` in UTC, matching the day the API will store. */
function todayInput(): string {
  return new Date().toISOString().slice(0, 10)
}

/**
 * A `YYYY-MM-DD` input back to the ISO instant the path expects.
 *
 * Today keeps the current time of day — the decision is being taken now, so the
 * moment is real. Any other date has no meaningful time, so it is pinned to
 * midnight UTC rather than inventing one.
 */
function toDecisionIso(date: string): string {
  return date === todayInput() ? new Date().toISOString() : `${date}T00:00:00.000Z`
}

/**
 * Formats the UTC calendar day the API stores, without shifting it locally.
 *
 * `expirationDate` in particular is now absent on every cargo in a live list
 * response (see `Cargo`), so this must tolerate a missing value rather than
 * assume every date field is always sent.
 */
function formatDate(iso: string | undefined | null): string {
  if (!iso) return '—'
  const [year, month, day] = iso.slice(0, 10).split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString(undefined, {
    timeZone: 'UTC',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

/**
 * Only render a document link the browser can actually open.
 *
 * The API has produced values like `https://petrox.quicko.rwfile:///home/...`
 * — the base URL concatenated with a local path — which parse as a URL but
 * navigate nowhere. A `file://` target is likewise unreachable from a browser.
 */
function isOpenableUrl(url: string | null): boolean {
  if (!url) return false

  // A second scheme anywhere after the first is the concatenation bug. This is
  // checked on the raw string on purpose: `new URL()` happily parses
  // `https://petrox.quicko.rwfile:///home/x` as hostname `petrox.quicko.rwfile`
  // with path `/home/x`, so inspecting the parsed parts finds nothing wrong.
  if (/^[a-z][a-z0-9+.-]*:\/\/.*[a-z][a-z0-9+.-]*:\/\//i.test(url)) return false

  try {
    const { protocol } = new URL(url)
    return protocol === 'http:' || protocol === 'https:'
  } catch {
    return false
  }
}

/** Vessel and BL together — what identifies a shipment in conversation. */
function cargoLabel(cargo: Cargo): string {
  return cargo.blRef ? `${cargo.vesselName} · BL ${cargo.blRef}` : cargo.vesselName
}

/** Quantities arrive as strings, so they are parsed before formatting. */
function formatQty(value: string | undefined): string {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed.toLocaleString() : (value ?? '—')
}

export function CargoPage() {
  const permissions = usePermissions()
  const { canRead, canCreate, canEdit } = permissions.forModule(PERMISSION_MODULES.cargo)
  // The orders query is shared with its own page, so it is gated on
  // `orders.read` rather than the cargo permission.
  const canReadOrders = permissions.forModule(PERMISSION_MODULES.orders).canRead
  const canReadDeports = permissions.forModule(PERMISSION_MODULES.deports).canRead
  /*
   * Invoices are their own module with their own `cargo.invoice.*` permissions,
   * so each action is gated on that rather than on the cargo permission the
   * rest of this page uses.
   */
  const invoicePermissions = permissions.forModule(PERMISSION_MODULES.cargoInvoices)

  const { cargo, isLoading, isError, error } = useCargoList({ enabled: canRead })
  const setStatus = useSetCargoStatus()
  const deleteInvoice = useDeleteCargoInvoice()

  const [createOpen, setCreateOpen] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  /** The shipment a new invoice is being raised against. */
  const [invoiceFor, setInvoiceFor] = useState<Cargo | null>(null)
  /** An existing invoice being edited, with the shipment it belongs to. */
  const [editInvoice, setEditInvoice] = useState<{ cargo: Cargo; invoice: CargoInvoice } | null>(
    null,
  )
  const [deleteTarget, setDeleteTarget] = useState<{ cargoId: string; invoice: CargoInvoice } | null>(
    null,
  )
  const [pending, setPending] = useState<{ row: Cargo; status: CargoStatus } | null>(null)
  /** The decision date shown in the confirmation, as a `YYYY-MM-DD` input value. */
  const [decisionDate, setDecisionDate] = useState(todayInput)
  /** Which row is mid-request, so its dropdown is disabled while saving. */
  const [savingId, setSavingId] = useState<string | null>(null)

  function confirmDeleteInvoice() {
    if (!deleteTarget) return
    deleteInvoice.mutate(
      { id: deleteTarget.invoice.id, cargoId: deleteTarget.cargoId },
      {
        onSuccess: () => {
          toast.success('Invoice deleted')
          setDeleteTarget(null)
        },
        onError: (err) => toast.error(errorMessage(err)),
      },
    )
  }

  function applyStatus(row: Cargo, status: CargoStatus, date?: string) {
    setSavingId(row.id)
    setStatus.mutate(
      { id: row.id, status, date },
      {
        onSuccess: () => {
          toast.success(`${row.vesselName} set to ${STATUS_LABEL[status].toLowerCase()}`)
          setPending(null)
        },
        onError: (err) => toast.error(errorMessage(err)),
        onSettled: () => setSavingId(null),
      },
    )
  }

  function requestStatusChange(row: Cargo, status: CargoStatus) {
    if (status === row.status) return
    if (NEEDS_CONFIRMATION.includes(status)) {
      // Reset to today each time, so a date left over from a previous decision
      // is never silently reused on the next one.
      setDecisionDate(todayInput())
      setPending({ row, status })
      return
    }
    // Back to pending is an undo rather than a decision, so it takes the
    // service default of now without asking.
    applyStatus(row, status)
  }

  const columns: DataTableColumn<Cargo>[] = [
    {
      header: 'Vessel',
      cell: (row) => (
        <div>
          <span className="font-medium">{row.vesselName}</span>
          <span className="block text-xs text-muted-foreground">BL {row.blRef}</span>
        </div>
      ),
    },
    {
      header: 'Order',
      // The list nests the order, so its code shows without a lookup.
      cell: (row) =>
        row.order?.orderCode ? (
          <code className="font-mono text-xs">{row.order.orderCode}</code>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      header: 'Deport',
      // Nested on the list too, so no second request is needed.
      cell: (row) =>
        row.deport ? (
          <div>
            <span className="text-sm">{row.deport.name}</span>
            {row.deport.location && (
              <span className="block text-xs text-muted-foreground">
                {row.deport.location}
              </span>
            )}
          </div>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      header: 'Quantity',
      /*
       * ⚠️ `quantityAt20C` / `ambQuantity` are absent on a live list response
       * as of September 2026 (see `Cargo`) — used when present, in case another
       * shape (detail endpoint, or a later response) still carries them.
       *
       * Falls back to summing `stocks[]`, which is now genuinely populated and
       * is the only figure left that reflects what actually arrived. The
       * `quantityInKg` / `quantityInLitre` fields that replaced the old pair on
       * this endpoint are `"0"` on every record seen so far, so they are shown
       * only as an explicit last resort — never silently trusted as real data.
       *
       * The order's own quantity is shown too whenever the corrected figure
       * falls short of or exceeds it — that gap is the thing worth noticing.
       */
      cell: (row) => {
        const stockTotal = (row.stocks ?? []).reduce(
          (sum, stock) => sum + (Number(stock.quantity) || 0),
          0,
        )
        const hasStockTotal = (row.stocks ?? []).length > 0

        const corrected = row.quantityAt20C !== undefined ? Number(row.quantityAt20C) : NaN
        const ambient = row.ambQuantity !== undefined ? Number(row.ambQuantity) : NaN
        const primary = Number.isFinite(corrected)
          ? corrected
          : hasStockTotal
            ? stockTotal
            : Number(row.quantityInLitre) || Number(row.quantityInKg) || NaN
        const primaryLabel = Number.isFinite(corrected)
          ? 'at 20 °C'
          : hasStockTotal
            ? 'received'
            : row.quantityInLitre
              ? 'litres'
              : 'kg'

        const ordered = Number(row.order?.quantity)
        const differsFromAmbient =
          Number.isFinite(corrected) && Number.isFinite(ambient) && corrected !== ambient
        const differsFromOrder =
          Number.isFinite(primary) && Number.isFinite(ordered) && primary !== ordered

        return (
          <div className="tabular-nums">
            {Number.isFinite(primary) ? (
              <>
                <span>{primary.toLocaleString()}</span>
                <span className="ml-1 text-xs font-normal text-muted-foreground">
                  {primaryLabel}
                </span>
              </>
            ) : (
              <span className="text-xs text-muted-foreground">—</span>
            )}
            {differsFromAmbient && (
              <span className="block text-xs text-muted-foreground">
                {formatQty(row.ambQuantity)} ambient
              </span>
            )}
            {differsFromOrder && (
              <span className="block text-xs text-muted-foreground">
                of {ordered.toLocaleString()} ordered
              </span>
            )}
          </div>
        )
      },
    },
    {
      header: 'Received',
      // `expirationDate` is no longer sent on a live list response — see
      // `Cargo`. The second line is dropped entirely rather than shown as
      // "expires —", which would read as missing data instead of a field the
      // endpoint simply stopped returning.
      cell: (row) => (
        <span className="text-sm">
          {formatDate(row.receivedDate)}
          {row.expirationDate && (
            <span className="block text-xs text-muted-foreground">
              expires {formatDate(row.expirationDate)}
            </span>
          )}
        </span>
      ),
    },
    {
      header: 'Document',
      cell: (row) => {
        if (!row.supportingDocUrl) return <span className="text-muted-foreground">—</span>
        if (!isOpenableUrl(row.supportingDocUrl)) {
          return (
            <span
              className="text-xs text-muted-foreground"
              title={`Not a usable link: ${row.supportingDocUrl}`}
            >
              Invalid link
            </span>
          )
        }
        return (
          <a
            href={row.supportingDocUrl}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1.5 text-sm text-primary underline-offset-2 hover:underline"
          >
            <FileText className="size-3.5" />
            View
          </a>
        )
      },
    },
    {
      header: 'Invoices',
      // A badge rather than a bare number: cargo's own figures above are all
      // plain text, so a stray digit here read as one more cargo quantity
      // instead of a distinct, related record. The whole row already expands
      // on click, so this needs no handler of its own — it just has to look
      // like the entry point it is.
      cell: (row) => {
        const count = row.cargoInvoices?.length ?? 0
        return count > 0 ? (
          <Badge variant="secondary" className="gap-1 font-normal tabular-nums">
            <ReceiptText className="size-3" />
            {count}
          </Badge>
        ) : (
          <span className="text-xs text-muted-foreground">No invoices</span>
        )
      },
    },
    {
      header: 'Status',
      cell: (row) => {
        // Three states rather than a boolean, so the status is chosen from a
        // list instead of toggled.
        if (!canEdit) {
          return <Badge variant={STATUS_VARIANT[row.status]}>{STATUS_LABEL[row.status]}</Badge>
        }

        return (
          <Select
            value={row.status}
            disabled={savingId === row.id}
            onValueChange={(value) => requestStatusChange(row, value as CargoStatus)}
          >
            <SelectTrigger className="h-8 w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CARGO_STATUSES.map((status) => (
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
            /*
             * Only cargo's own edit lives here now. Raising an invoice used to
             * sit right beside it as a second, near-identical ghost icon button
             * — the two were easy to confuse, since nothing marked one as
             * "about this cargo" and the other as "about a different record
             * belonging to it". The row already expands to a clearly labelled
             * Invoices panel (see `renderExpanded`) with its own "New invoice"
             * button, so that action lives there instead.
             */
            cell: (row: Cargo) =>
              isEditable(row.status) ? (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setEditId(row.id)}
                  title="Edit cargo"
                >
                  <Pencil className="size-3.5" />
                </Button>
              ) : (
                <span
                  className="px-2 text-xs text-muted-foreground"
                  title={`Cargo is ${row.status}`}
                >
                  —
                </span>
              ),
          },
        ]
      : []),
  ]

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight">Cargo</h1>
          <p className="text-sm text-muted-foreground">
            Shipments received against your orders.
          </p>
        </div>
        {canCreate && (
          <Button onClick={() => setCreateOpen(true)}>
            <Plus />
            New cargo
          </Button>
        )}
      </div>

      {!canRead ? (
        <NoAccess resource="cargo" />
      ) : isError && errorCode(error) === 'FORBIDDEN' ? (
        <NoAccess resource="cargo" variant="rejected" permission="cargo.read" />
      ) : isError ? (
        <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {errorMessage(error)}
        </p>
      ) : (
        <DataTable
          columns={columns}
          data={cargo}
          rowKey={(row) => row.id}
          isLoading={isLoading}
          emptyMessage="No cargo yet. Record the first shipment against an order."
          getSearchText={(row) =>
            `${row.vesselName} ${row.blRef} ${row.tansisRef ?? ''} ${row.outurnRef ?? ''} ${row.order?.orderCode ?? ''} ${row.deport?.name ?? ''}`
          }
          searchPlaceholder="Search cargo…"
          pageSize={15}
          // Invoices live in the row's detail panel: they belong to the
          // shipment, and several of them would not fit a table cell. Rows with
          // no invoices and no way to add one stay non-clickable.
          renderExpanded={(row) => {
            const invoices = row.cargoInvoices ?? []
            if (invoices.length === 0 && !invoicePermissions.canCreate) return null
            return (
              // `px-4 py-3` on the panel, then bordered `bg-background` cards
              // directly beneath — the same layout Stock and Central stock use
              // for a list of related records under a parent row, so an
              // invoice reads as "one of this shipment's records" rather than
              // borrowing a look invented just for this page.
              <div className="px-4 py-3">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                    <ReceiptText className="size-3.5" />
                    {invoices.length === 0
                      ? 'Invoices'
                      : `${invoices.length} ${invoices.length === 1 ? 'invoice' : 'invoices'}`}
                  </p>
                  {invoicePermissions.canCreate && (
                    <Button size="sm" variant="outline" onClick={() => setInvoiceFor(row)}>
                      <Plus className="size-3.5" />
                      New invoice
                    </Button>
                  )}
                </div>
                <CargoInvoiceList
                  invoices={invoices}
                  canEdit={invoicePermissions.canEdit}
                  canDelete={invoicePermissions.canDelete}
                  onEdit={(invoice) => setEditInvoice({ cargo: row, invoice })}
                  onDelete={(invoice) => setDeleteTarget({ cargoId: row.id, invoice })}
                />
              </div>
            )
          }}
        />
      )}

      <CargoFormDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        canReadOrders={canReadOrders}
        canReadDeports={canReadDeports}
      />

      {/* Keyed by id so the form re-fetches when a different record is opened. */}
      <CargoFormDialog
        key={editId ?? 'edit'}
        open={Boolean(editId)}
        onOpenChange={(open) => !open && setEditId(null)}
        cargoId={editId}
        canReadOrders={canReadOrders}
        canReadDeports={canReadDeports}
      />

      {/* Keyed by shipment so the form re-seeds when a different row is used. */}
      {invoiceFor && (
        <CargoInvoiceFormDialog
          key={`new-${invoiceFor.id}`}
          open={Boolean(invoiceFor)}
          onOpenChange={(open) => !open && setInvoiceFor(null)}
          cargoId={invoiceFor.id}
          cargoLabel={cargoLabel(invoiceFor)}
        />
      )}

      {editInvoice && (
        <CargoInvoiceFormDialog
          key={`edit-${editInvoice.invoice.id}`}
          open={Boolean(editInvoice)}
          onOpenChange={(open) => !open && setEditInvoice(null)}
          cargoId={editInvoice.cargo.id}
          cargoLabel={cargoLabel(editInvoice.cargo)}
          invoice={editInvoice.invoice}
        />
      )}

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Delete this invoice?"
        description={
          deleteTarget
            ? `${deleteTarget.invoice.invoiceCode} (${deleteTarget.invoice.invoiceReference}) will be removed permanently.`
            : ''
        }
        confirmLabel="Delete"
        variant="destructive"
        isLoading={deleteInvoice.isPending}
        onConfirm={confirmDeleteInvoice}
      />

      <ConfirmDialog
        open={Boolean(pending)}
        onOpenChange={(open) => !open && setPending(null)}
        title={
          pending
            ? `Mark ${pending.row.vesselName} as ${STATUS_LABEL[pending.status].toLowerCase()}?`
            : ''
        }
        description="You can change the status again afterwards."
        confirmLabel={pending ? STATUS_LABEL[pending.status] : 'Confirm'}
        variant={pending?.status === 'cancelled' ? 'destructive' : 'default'}
        confirmDisabled={!decisionDate}
        onConfirm={() =>
          pending && applyStatus(pending.row, pending.status, toDecisionIso(decisionDate))
        }
        isLoading={setStatus.isPending}
      >
        {/* The API records when the decision was taken, so it is asked for
            rather than assumed. Defaults to today, which is the common case. */}
        <div className="grid gap-1.5">
          <Label htmlFor="decisionDate">
            {pending?.status === 'cancelled' ? 'Cancellation date' : 'Approval date'}
          </Label>
          <Input
            id="decisionDate"
            type="date"
            value={decisionDate}
            max={todayInput()}
            onChange={(event) => setDecisionDate(event.target.value)}
          />
          <p className="text-xs text-muted-foreground">Defaults to today.</p>
        </div>
      </ConfirmDialog>
    </div>
  )
}
