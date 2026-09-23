import { FileText, Pencil, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { documentHref } from '@/features/cargo-invoices/document-href'
import type { CargoInvoice } from '@/api/types'

/** Amounts arrive as strings, so both are parsed before formatting. */
function formatMoney(value: string | number | undefined | null): string {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed.toLocaleString() : '—'
}

/**
 * The invoices raised against one shipment.
 *
 * Rendered inside the cargo row's detail panel rather than as its own table, so
 * it is deliberately compact — the shipment is already named by the row above
 * it, and nothing here repeats it.
 */
export function CargoInvoiceList({
  invoices,
  canEdit,
  canDelete,
  onEdit,
  onDelete,
}: {
  invoices: CargoInvoice[]
  canEdit: boolean
  canDelete: boolean
  onEdit: (invoice: CargoInvoice) => void
  onDelete: (invoice: CargoInvoice) => void
}) {
  if (invoices.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">No invoices against this shipment yet.</p>
    )
  }

  return (
    <div className="grid gap-2">
      {invoices.map((invoice) => {
        // The API does not check `amount` against quantity x unit price, so a
        // mismatch is real data rather than a display error — it is flagged
        // instead of silently reconciled.
        const expected = Number(invoice.quantity) * Number(invoice.unitPrice)
        const differs =
          Number.isFinite(expected) &&
          Number.isFinite(Number(invoice.amount)) &&
          Math.abs(expected - Number(invoice.amount)) > 0.005
        const href = documentHref(invoice.supportingDocUrl)

        return (
          <div
            key={invoice.id}
            className="flex flex-wrap items-baseline justify-between gap-3 rounded-md border bg-background px-3 py-2"
          >
            <div className="min-w-40">
              <span className="text-sm font-medium">{invoice.invoiceCode}</span>
              <span className="block font-mono text-xs text-muted-foreground">
                {invoice.invoiceReference}
              </span>
            </div>

            <div className="text-sm tabular-nums text-muted-foreground">
              {formatMoney(invoice.quantity)} × {formatMoney(invoice.unitPrice)}
            </div>

            <div className="text-right tabular-nums">
              <span className="text-sm font-medium">
                {formatMoney(invoice.amount)}
                <span className="ml-1 text-xs font-normal text-muted-foreground">
                  {invoice.currencyCode}
                </span>
              </span>
              {differs && (
                <span className="block text-xs font-normal text-muted-foreground">
                  quantity × price is {formatMoney(expected)}
                </span>
              )}
            </div>

            <div className="flex items-center gap-1">
              {href ? (
                <a
                  href={href}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs text-primary underline-offset-2 hover:underline"
                >
                  <FileText className="size-3.5" />
                  View
                </a>
              ) : (
                <span className="text-xs text-muted-foreground">—</span>
              )}
              {canEdit && (
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Edit invoice"
                  onClick={() => onEdit(invoice)}
                >
                  <Pencil className="size-4" />
                </Button>
              )}
              {canDelete && (
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Delete invoice"
                  onClick={() => onDelete(invoice)}
                >
                  <Trash2 className="size-4 text-destructive" />
                </Button>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
