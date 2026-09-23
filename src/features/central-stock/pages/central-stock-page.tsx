import { useState } from 'react'
import { BadgeCheck, ChevronRight, FileText, Plus, Scale } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { DataTable, type DataTableColumn } from '@/components/data-table'
import { NoAccess } from '@/components/no-access'
import { PERMISSION_MODULES, usePermissions } from '@/hooks/use-permissions'
import { CentralStockFormDialog } from '@/features/central-stock/components/central-stock-form-dialog'
import { ReconciliationDialog } from '@/features/central-stock/components/reconciliation-dialog'
import { ClearanceDialog } from '@/features/central-stock/components/clearance-dialog'
import { useCentralStock } from '@/features/central-stock/use-central-stock'
import { cn } from '@/lib/utils'
import { errorCode, errorMessage } from '@/lib/error-message'
import type { CentralStock, CentralStockGroup } from '@/api/types'

/**
 * Movement types, spelled as the API sends them.
 *
 * ⚠️ `reconcilliation*` carries the doubled `l` — the same misspelling as
 * `RECONCILIATION_TYPES`, so the labels absorb it rather than showing it.
 */
const TRANSACTION_LABELS: Record<string, string> = {
  received: 'received',
  reconcilliationIn: 'reconciled in',
  reconcilliationOut: 'reconciled out',
  cleared: 'cleared',
  soldOut: 'sold out',
}

/** Quantities are numbers here, but parsed defensively as elsewhere. */
function formatQty(value: number | string | undefined): string {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed.toLocaleString() : '—'
}

/** Formats the UTC calendar day the API stores, without shifting it locally. */
function formatDate(iso: string | undefined): string {
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
 * Only render a document link the browser can actually open — the same guard
 * cargo uses; see the note there for why the raw string is checked.
 *
 * ⚠️ Central stock has returned **root-relative** paths (`/uploads/…`) as well
 * as absolute URLs. Uploads are served from the server root rather than under
 * the API prefix, so a bare path resolves against the page's own origin — which
 * is also what makes it work behind the dev proxy.
 */
function documentHref(url: string | null | undefined): string | null {
  if (!url) return null
  // Two schemes means the concatenation bug cargo also hits.
  if (/^[a-z][a-z0-9+.-]*:\/\/.*[a-z][a-z0-9+.-]*:\/\//i.test(url)) return null

  try {
    const { protocol, href } = new URL(url, window.location.origin)
    return protocol === 'http:' || protocol === 'https:' ? href : null
  } catch {
    return null
  }
}

/** Clearance is a separate dimension from stock status, so it reads differently. */
const CLEARANCE_VARIANT: Record<string, 'default' | 'secondary' | 'outline'> = {
  cleared: 'default',
  uncleared: 'secondary',
}

export function CentralStockPage() {
  const permissions = usePermissions()
  // Dotted module code — `central.stock`, not `central_stock`.
  // Reconciliation adjusts an existing receipt rather than creating one, and
  // the API exposes no permission of its own for it — so it is gated on `edit`.
  const { canRead, canCreate, canEdit } = permissions.forModule(
    PERMISSION_MODULES.centralStock,
  )
  const canReadT1 = permissions.forModule(PERMISSION_MODULES.t1Validation).canRead
  const canReadItems = permissions.forModule(PERMISSION_MODULES.items).canRead
  const canReadUnits = permissions.forModule(PERMISSION_MODULES.units).canRead
  const canReadDeports = permissions.forModule(PERMISSION_MODULES.deports).canRead
  // Agents are their own module, so the picker is gated on its permission.
  const canReadAgents = permissions.forModule(PERMISSION_MODULES.clearanceAgents).canRead

  const { groups, isLoading, isError, error } = useCentralStock({ enabled: canRead })

  const [createOpen, setCreateOpen] = useState(false)
  /** The item being cleared. Clearance is per item, not per receipt. */
  const [clearingGroup, setClearingGroup] = useState<CentralStockGroup | null>(null)
  /** The receipt being reconciled, with its unit for labelling. */
  const [reconciling, setReconciling] = useState<{
    stock: CentralStock
    unitCode?: string
  } | null>(null)

  const columns: DataTableColumn<CentralStockGroup>[] = [
    {
      header: 'Item',
      // The item carries a resolved `baseUnit`, so the unit needs no lookup.
      cell: (group) => (
        <div className="flex items-center gap-2">
          <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" />
          <div>
            <span className="font-medium">{group.item?.name ?? '—'}</span>
            {group.item?.baseUnit && (
              <span className="block text-xs text-muted-foreground">
                in {group.item.baseUnit.name} ({group.item.baseUnit.code})
              </span>
            )}
          </div>
        </div>
      ),
    },
    {
      header: 'Remaining',
      // The headline figure: what is actually still held, already net of
      // reconciliation and sales.
      cell: (group) => {
        const code = group.item?.baseUnit?.code
        return (
          <span className="font-medium tabular-nums">
            {formatQty(group.summary?.remainingQuantity)}
            {code && <span className="ml-1 text-xs font-normal text-muted-foreground">{code}</span>}
          </span>
        )
      },
    },
    {
      header: 'Movement',
      /*
       * What has moved since receipt. Reconciliation is signed — it can add or
       * remove — so the two directions are shown separately rather than netted,
       * which would hide an adjustment in both directions.
       *
       * ⚠️ The API split `reconciledQuantity` into In/Out when reconciliation
       * shipped; reading the old field silently showed nothing.
       */
      cell: (group) => {
        const s = group.summary
        if (!s) return <span className="text-muted-foreground">—</span>
        // Falls back to the retired single field if an older server responds.
        const reconciledIn = Number(s.reconciledInQuantity ?? 0)
        const reconciledOut = Number(s.reconciledOutQuantity ?? s.reconciledQuantity ?? 0)
        return (
          <div className="tabular-nums text-xs">
            <span className="text-sm">{formatQty(s.receivedQuantity)} received</span>
            {reconciledIn > 0 && (
              <span className="block text-muted-foreground">
                +{formatQty(reconciledIn)} reconciled in
              </span>
            )}
            {reconciledOut > 0 && (
              <span className="block text-muted-foreground">
                −{formatQty(reconciledOut)} reconciled out
              </span>
            )}
            {s.soldOutQuantity > 0 && (
              <span className="block text-muted-foreground">
                −{formatQty(s.soldOutQuantity)} sold out
              </span>
            )}
          </div>
        )
      },
    },
    {
      header: 'Clearance',
      // A second, independent dimension: stock can be in hand yet not
      // customs-cleared, so it gets its own column rather than being folded
      // into the stock status.
      cell: (group) => {
        const byClearance = group.summary?.clearanceQuantitiesByStatus ?? {}
        const entries = Object.entries(byClearance)

        // The per-status map is empty until a clearance exists, but the summary
        // still reports what is uncleared — so that is shown rather than a dash
        // that reads as "nothing to clear".
        if (entries.length === 0) {
          const uncleared = Number(group.summary?.unclearedQuantity)
          if (!Number.isFinite(uncleared) || uncleared <= 0) {
            return <span className="text-muted-foreground">—</span>
          }
          return (
            <Badge variant={CLEARANCE_VARIANT.uncleared ?? 'outline'} className="font-normal">
              uncleared {formatQty(uncleared)}
            </Badge>
          )
        }

        return (
          <div className="flex flex-wrap gap-1">
            {entries.map(([status, quantity]) => (
              <Badge
                key={status}
                variant={CLEARANCE_VARIANT[status] ?? 'outline'}
                className="font-normal"
              >
                {status} {formatQty(quantity)}
              </Badge>
            ))}
          </div>
        )
      },
    },
    {
      header: 'Status',
      cell: (group) => {
        const byStatus = group.summary?.quantitiesByStatus ?? {}
        const entries = Object.entries(byStatus)
        if (entries.length === 0) return <span className="text-muted-foreground">—</span>

        return (
          <div className="flex flex-wrap gap-1">
            {entries.map(([status, quantity]) => (
              <Badge key={status} variant="outline" className="font-normal">
                {status} {formatQty(quantity)}
              </Badge>
            ))}
          </div>
        )
      },
    },
    {
      header: 'Receipts',
      cell: (group) => (
        <span className="text-sm text-muted-foreground">
          {group.summary?.stockCount ?? (group.stocks ?? []).length}
        </span>
      ),
    },
    ...(canEdit
      ? [
          {
            header: '',
            className: 'text-right',
            cell: (group: CentralStockGroup) => {
              // Clearance is raised per item and bounded by what is uncleared,
              // so the action is hidden once there is nothing left to clear —
              // it would only open a form the API must refuse.
              const uncleared = Number(
                group.summary?.unclearedQuantity ?? group.summary?.remainingQuantity,
              )
              const hasUncleared = Number.isFinite(uncleared) && uncleared > 0

              return (
                <div
                  className="flex justify-end"
                  // The row toggles its receipts on click, so the action must
                  // not also expand it on the way through.
                  onClick={(event) => event.stopPropagation()}
                >
                  {hasUncleared ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setClearingGroup(group)}
                      title={`Clear up to ${uncleared.toLocaleString()}`}
                    >
                      <BadgeCheck className="size-3.5" />
                      Clear
                    </Button>
                  ) : (
                    <span
                      className="text-xs text-muted-foreground"
                      title="Nothing left to clear"
                    >
                      —
                    </span>
                  )}
                </div>
              )
            },
          },
        ]
      : []),
  ]

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight">Central stock</h1>
          <p className="text-sm text-muted-foreground">
            Stock held centrally against T1 validations, grouped by item. Click an item to
            see each receipt and its clearances.
          </p>
        </div>
        {canCreate && (
          <Button onClick={() => setCreateOpen(true)}>
            <Plus />
            New central stock
          </Button>
        )}
      </div>

      {!canRead ? (
        <NoAccess resource="central stock" />
      ) : isError && errorCode(error) === 'FORBIDDEN' ? (
        <NoAccess resource="central stock" variant="rejected" permission="central.stock.read" />
      ) : isError ? (
        <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {errorMessage(error)}
        </p>
      ) : (
        <DataTable
          columns={columns}
          data={groups}
          rowKey={(group) => group.item?.id ?? ''}
          isLoading={isLoading}
          emptyMessage="No central stock yet. Record a receipt against a confirmed T1 validation to get started."
          getSearchText={(group) => {
            const depots = (group.stocks ?? []).map((s) => s.depot?.name ?? '').join(' ')
            const countries = (group.stocks ?? [])
              .map((s) => s.t1Validation?.exportingCountry ?? '')
              .join(' ')
            return `${group.item?.name ?? ''} ${group.item?.baseUnit?.code ?? ''} ${depots} ${countries}`
          }}
          searchPlaceholder="Search central stock…"
          pageSize={15}
          renderExpanded={(group) => {
            const rows = group.stocks ?? []
            if (rows.length === 0) return null
            const code = group.item?.baseUnit?.code

            return (
              <div className="grid gap-3 px-4 py-3">
                <p className="text-xs font-medium text-muted-foreground">
                  {rows.length} {rows.length === 1 ? 'receipt' : 'receipts'}
                </p>

                {rows.map((row: CentralStock) => {
                  const href = documentHref(row.supportingDocUrl)
                  const nomination = row.t1Validation?.nomination
                  /*
                   * 🔴 The reconciliation figures arrive on the GROUP, not on
                   * the receipt — but they describe exactly one receipt, the one
                   * whose id the group repeats. See `CentralStockGroup`. So they
                   * are shown against that receipt and nowhere else; every other
                   * receipt correctly shows none.
                   *
                   * This keeps working unchanged once the API moves them onto
                   * the receipt where they belong.
                   */
                  const reconciliation = group.id === row.id ? group : null
                  const lossQty = Number(reconciliation?.lossQty)
                  const gainQty = Number(reconciliation?.gainQty)
                  const hasLoss = Number.isFinite(lossQty) && lossQty > 0
                  const hasGain = Number.isFinite(gainQty) && gainQty > 0
                  const toleranceRate = Number(reconciliation?.toleranceRate)
                  /*
                   * The loss measured against the allowance it was received
                   * under. Both are plain quantities, so this compares like with
                   * like rather than assuming a percentage.
                   */
                  const overTolerance =
                    hasLoss && Number.isFinite(toleranceRate) && lossQty > toleranceRate

                  return (
                    <div key={row.id} className="rounded-md border bg-background p-3">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-40">
                          <span className="text-sm font-medium">
                            {row.depot?.name ?? 'Depot'}
                          </span>
                          <span className="block text-xs text-muted-foreground">
                            {row.depot?.location ?? ''}
                            {row.depot?.type ? ` · ${row.depot.type}` : ''}
                          </span>
                          {/* The T1 it was received against, and where that
                              nomination was headed. */}
                          {row.t1Validation && (
                            <span className="block text-xs text-muted-foreground">
                              via {row.t1Validation.exportingCountry}
                              {nomination?.destination ? ` → ${nomination.destination}` : ''}
                            </span>
                          )}
                        </div>

                        <div className="text-right tabular-nums">
                          <span className="text-sm font-medium">
                            {formatQty(row.remainingQuantity)}
                            {code && (
                              <span className="ml-1 text-xs font-normal text-muted-foreground">
                                {code}
                              </span>
                            )}
                          </span>
                          {/* Only shown when something has been drawn against
                              it — otherwise the two figures are identical. */}
                          {row.remainingQuantity !== row.receivedQuantity && (
                            <span className="block text-xs text-muted-foreground">
                              of {formatQty(row.receivedQuantity)} received
                            </span>
                          )}
                          {/* The ambient figure this receipt was measured at,
                              beside the corrected one it was booked in as. */}
                          {reconciliation?.ambQuantity && (
                            <span className="block text-xs text-muted-foreground">
                              {formatQty(reconciliation.ambQuantity)} ambient
                            </span>
                          )}
                          <span className="block text-xs text-muted-foreground">
                            {formatDate(row.createdAt)}
                          </span>
                        </div>

                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="font-normal">
                            {row.status}
                          </Badge>
                          {href && (
                            <a
                              href={href}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 text-xs text-primary underline-offset-2 hover:underline"
                            >
                              <FileText className="size-3.5" />
                              Doc
                            </a>
                          )}
                          {/* Reconciliation targets one receipt, so the action
                              belongs here rather than on the item group. */}
                          {canEdit && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={(event) => {
                                // The group row toggles on click; without this
                                // the panel would collapse under the dialog.
                                event.stopPropagation()
                                setReconciling({ stock: row, unitCode: code })
                              }}
                              title="Adjust this receipt up or down"
                            >
                              <Scale className="size-3.5" />
                              Reconcile
                            </Button>
                          )}
                        </div>
                      </div>

                      {/* What was lost or gained between the T1 and the
                          weighbridge, against the allowance it was received
                          under. Shown only on the receipt that carries them. */}
                      {(hasLoss || hasGain || Number.isFinite(toleranceRate)) && (
                        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 border-t pt-2 text-xs">
                          {hasLoss && (
                            <span
                              className={
                                overTolerance
                                  ? 'font-medium text-destructive'
                                  : 'text-muted-foreground'
                              }
                            >
                              Loss {formatQty(reconciliation?.lossQty ?? '')}
                              {code ? ` ${code}` : ''}
                              {overTolerance && ' — over tolerance'}
                            </span>
                          )}
                          {hasGain && (
                            <span className="text-muted-foreground">
                              Gain {formatQty(reconciliation?.gainQty ?? '')}
                              {code ? ` ${code}` : ''}
                            </span>
                          )}
                          {Number.isFinite(toleranceRate) && (
                            <span className="text-muted-foreground">
                              Tolerance {formatQty(reconciliation?.toleranceRate ?? '')}
                              {code ? ` ${code}` : ''}
                            </span>
                          )}
                          {!hasLoss && !hasGain && (
                            <span className="text-muted-foreground">
                              No loss or gain recorded
                            </span>
                          )}
                        </div>
                      )}

                      {/* Clearances: what went through customs, by whom, at
                          what cost. A receipt can be partly cleared, so the
                          split is shown even when only one clearance exists. */}
                      {(row.clearances ?? []).length > 0 && (
                        <div className="mt-2 grid gap-1.5 border-t pt-2">
                          <p className="text-xs font-medium text-muted-foreground">
                            Clearances
                          </p>
                          {(row.clearances ?? []).map((clearance) => {
                            /*
                             * The clearance dialog no longer offers a supporting
                             * document, but it is still shown here: clearances
                             * raised before that change may carry one, and
                             * hiding it would lose real data.
                             */
                            const clearanceHref = documentHref(clearance.supportingDocUrl)
                            const dmsHref = documentHref(clearance.dmsDocUrl)

                            return (
                              <div
                                key={clearance.id}
                                className="flex flex-wrap items-center gap-2 text-xs"
                              >
                                <Badge
                                  variant={CLEARANCE_VARIANT[clearance.status] ?? 'outline'}
                                  className="font-normal"
                                >
                                  {clearance.status}
                                </Badge>
                                <span className="tabular-nums font-medium">
                                  {formatQty(clearance.quantity)}
                                  {code ? ` ${code}` : ''}
                                </span>
                                {/* `names`, not `name` — it is the agent record. */}
                                {clearance.agent && (
                                  <span className="text-muted-foreground">
                                    via {clearance.agent.names}
                                  </span>
                                )}
                                {clearance.amount !== null && (
                                  <span className="tabular-nums text-muted-foreground">
                                    {formatQty(clearance.amount)}
                                    {clearance.fees !== null
                                      ? ` (+${formatQty(clearance.fees)} fees)`
                                      : ''}
                                  </span>
                                )}
                                {clearance.clearedBy && (
                                  <span className="text-muted-foreground">
                                    by {clearance.clearedBy.firstName} {clearance.clearedBy.lastName}
                                  </span>
                                )}
                                {clearance.createdAt && (
                                  <span className="text-muted-foreground">
                                    {formatDate(clearance.createdAt)}
                                  </span>
                                )}
                                {clearanceHref && (
                                  <a
                                    href={clearanceHref}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="text-primary underline-offset-2 hover:underline"
                                  >
                                    Doc
                                  </a>
                                )}
                                {dmsHref && (
                                  <a
                                    href={dmsHref}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="text-primary underline-offset-2 hover:underline"
                                  >
                                    DMS
                                  </a>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      )}

                      {/* The movement ledger. It hangs off the receipt now —
                          it used to be nested inside each clearance — so it is
                          its own section rather than a sub-list. */}
                      {(row.transactions ?? []).length > 0 && (
                        <div className="mt-2 grid gap-0.5 border-t pt-2">
                          <p className="text-xs font-medium text-muted-foreground">
                            Movements
                          </p>
                          {(row.transactions ?? []).map((txn) => {
                            // `reconcilliationIn` adds, everything else removes.
                            const isIn =
                              txn.type === 'received' || txn.type === 'reconcilliationIn'
                            return (
                              <div
                                key={txn.id}
                                className="flex flex-wrap items-baseline gap-2 text-xs"
                              >
                                <span
                                  className={cn(
                                    'tabular-nums font-medium',
                                    isIn ? 'text-foreground' : 'text-destructive',
                                  )}
                                >
                                  {isIn ? '+' : '−'}
                                  {formatQty(txn.quantity)}
                                  {code ? ` ${code}` : ''}
                                </span>
                                <span className="text-muted-foreground">
                                  {TRANSACTION_LABELS[txn.type] ?? txn.type}
                                </span>
                                {txn.createdBy && (
                                  <span className="text-muted-foreground">
                                    {txn.createdBy.firstName} {txn.createdBy.lastName}
                                  </span>
                                )}
                                {txn.createdAt && (
                                  <span className="text-muted-foreground">
                                    {formatDate(txn.createdAt)}
                                  </span>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )
          }}
        />
      )}

      <ClearanceDialog
        open={clearingGroup !== null}
        onOpenChange={(open) => {
          if (!open) setClearingGroup(null)
        }}
        group={clearingGroup}
        canReadAgents={canReadAgents}
      />

      <ReconciliationDialog
        open={reconciling !== null}
        onOpenChange={(open) => {
          if (!open) setReconciling(null)
        }}
        stock={reconciling?.stock ?? null}
        unitCode={reconciling?.unitCode}
      />

      <CentralStockFormDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        canReadT1={canReadT1}
        canReadItems={canReadItems}
        canReadUnits={canReadUnits}
        canReadDeports={canReadDeports}
      />
    </div>
  )
}
