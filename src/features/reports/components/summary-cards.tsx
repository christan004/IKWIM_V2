/** Figures arrive as numbers here, but are parsed anyway for consistency. */
function formatNumber(value: number | string | undefined | null): string {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed.toLocaleString() : '—'
}

export interface SummaryCard {
  label: string
  value: number | string | undefined | null
  /** Shown small beneath the figure — a unit, or what it is measured against. */
  hint?: string
}

/**
 * The totals block above a report.
 *
 * Kept separate from the table because the summary covers the **whole filtered
 * set**, not the page of rows below it — a distinction that is easy to lose if
 * the two are rendered as one block.
 */
export function SummaryCards({ cards }: { cards: SummaryCard[] }) {
  const shown = cards.filter((card) => card.value !== undefined && card.value !== null)
  if (shown.length === 0) return null

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {shown.map((card) => (
        <div key={card.label} className="rounded-md border bg-background p-3">
          <p className="text-xs text-muted-foreground">{card.label}</p>
          <p className="mt-0.5 text-xl font-semibold tabular-nums">
            {formatNumber(card.value)}
          </p>
          {card.hint && (
            <p className="mt-0.5 text-xs text-muted-foreground">{card.hint}</p>
          )}
        </div>
      ))}
    </div>
  )
}

/**
 * A `Record<string, …>` breakdown rendered as chips.
 *
 * Both report families return at least one of these (`cargosByStatus`,
 * `transactionsByType`, `byType`), always keyed by a status or type the API
 * decides — so the keys are rendered as they arrive rather than mapped through
 * a fixed list that a new status would fall out of.
 */
export function BreakdownChips({
  label,
  entries,
}: {
  label: string
  entries: Record<string, { count: number; quantity?: number; ambientQuantity?: number; quantityAt20C?: number }> | undefined
}) {
  const rows = Object.entries(entries ?? {})
  if (rows.length === 0) return null

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      {rows.map(([key, value]) => {
        const quantity = value.quantity ?? value.quantityAt20C ?? value.ambientQuantity
        return (
          <span
            key={key}
            className="rounded-full border bg-background px-2.5 py-1 text-xs tabular-nums"
          >
            <span className="font-medium">{key}</span>
            <span className="text-muted-foreground">
              {' '}
              {value.count}
              {quantity !== undefined ? ` · ${formatNumber(quantity)}` : ''}
            </span>
          </span>
        )
      })}
    </div>
  )
}
