import { useMemo, useState } from 'react'
import { ArrowDownLeft, ArrowUpRight, ChevronRight, Plus, X } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { DataTable, type DataTableColumn } from '@/components/data-table'
import { NoAccess } from '@/components/no-access'
import { PERMISSION_MODULES, usePermissions } from '@/hooks/use-permissions'
import {
  useClientWallets,
  useToggleClientWalletStatus,
  useWalletMovements,
} from '@/features/client-wallets/use-client-wallets'
import { WalletMovementDialog } from '@/features/client-wallets/components/wallet-movement-dialog'
import { useClients } from '@/features/clients/use-clients'
import { cn } from '@/lib/utils'
import { errorCode, errorMessage, errorStatus } from '@/lib/error-message'
import type { ClientWallet, WalletMovementType } from '@/api/types'

/** Which way each type moves the balance. */
const MOVEMENT_OUT: WalletMovementType[] = ['PAYMENT', 'WITHDRAWAL', 'TRANSFER']

/** Balances may arrive as strings, as amounts do elsewhere in this API. */
function formatAmount(value: number | string | undefined): string {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed.toLocaleString() : '—'
}

/**
 * One wallet's ledger.
 *
 * Its own component so the query is scoped to the expanded row — the table
 * renders this only once opened, so no movements are fetched until then.
 */
function WalletLedger({ walletId }: { walletId: string }) {
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')

  /**
   * Only set filters are sent, and each date is widened to cover the whole
   * calendar day — the same handling every other date filter here uses.
   */
  const filter = useMemo(
    () => ({
      ...(startDate ? { startDate: `${startDate}T00:00:00.000Z` } : {}),
      ...(endDate ? { endDate: `${endDate}T23:59:59.999Z` } : {}),
    }),
    [startDate, endDate],
  )

  const isFiltered = Object.keys(filter).length > 0
  const { movements, isLoading, isError, error } = useWalletMovements(walletId, { filter })

  const controls = (
    <div className="flex flex-wrap items-end gap-3">
      <div className="grid gap-1">
        <Label htmlFor={`from-${walletId}`} className="text-xs">
          From
        </Label>
        <Input
          id={`from-${walletId}`}
          type="date"
          className="h-8 w-36"
          value={startDate}
          max={endDate || undefined}
          onChange={(event) => setStartDate(event.target.value)}
        />
      </div>
      <div className="grid gap-1">
        <Label htmlFor={`to-${walletId}`} className="text-xs">
          To
        </Label>
        <Input
          id={`to-${walletId}`}
          type="date"
          className="h-8 w-36"
          value={endDate}
          min={startDate || undefined}
          onChange={(event) => setEndDate(event.target.value)}
        />
      </div>
      {isFiltered && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            setStartDate('')
            setEndDate('')
          }}
        >
          <X className="size-3.5" />
          Clear
        </Button>
      )}
    </div>
  )

  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Movements
        </p>
        {controls}
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading movements…</p>
      ) : isError ? (
        // The endpoint 500s once a movement exists — a server-side
        // serialisation fault, not something the filter caused. Named as such
        // so it does not read as a bad date range.
        <p className="text-sm text-destructive">
          {errorStatus(error) === 500
            ? 'The ledger could not be loaded — the server errors on this request.'
            : errorMessage(error)}
        </p>
      ) : movements.length === 0 ? (
        // An empty ledger is a new wallet or an empty range, not a failure.
        <p className="text-sm text-muted-foreground">
          {isFiltered ? 'No movements in this range.' : 'No movements yet.'}
        </p>
      ) : (
        <div className="grid gap-1">
      {movements.map((movement) => {
        const isOut = MOVEMENT_OUT.includes(movement.type)
        return (
          <div key={movement.id} className="flex flex-wrap items-baseline gap-2 text-xs">
            <span
              className={cn(
                'inline-flex items-center gap-1 tabular-nums font-medium',
                isOut ? 'text-destructive' : 'text-foreground',
              )}
            >
              {isOut ? (
                <ArrowDownLeft className="size-3" />
              ) : (
                <ArrowUpRight className="size-3" />
              )}
              {isOut ? '−' : '+'}
              {formatAmount(movement.amount)}
            </span>
            <span className="text-muted-foreground">{movement.type.toLowerCase()}</span>
            {movement.account && (
              <span className="font-mono text-muted-foreground">
                {movement.account.code ?? movement.account.name}
              </span>
            )}
            {movement.referenceId && (
              <span className="font-mono text-muted-foreground">{movement.referenceId}</span>
            )}
            {movement.user && (
              <span className="text-muted-foreground">
                {movement.user.firstName} {movement.user.lastName}
              </span>
            )}
            {movement.createdAt && (
              <span className="text-muted-foreground">
                {new Date(movement.createdAt).toLocaleDateString(undefined, {
                  day: 'numeric',
                  month: 'short',
                  year: 'numeric',
                })}
              </span>
            )}
          </div>
        )
      })}
        </div>
      )}
    </div>
  )
}

export function ClientWalletsPage() {
  const permissions = usePermissions()
  const { canRead, canEdit } = permissions.forModule(PERMISSION_MODULES.clientWallets)
  // Only to name the organisation a wallet belongs to.
  const canReadClients = permissions.forModule(PERMISSION_MODULES.clients).canRead

  // Gated on its own module's permission — a deposit names a company account.
  const canReadAccounts = permissions.forModule(PERMISSION_MODULES.companyAccounts).canRead

  const { wallets, isLoading, isError, error } = useClientWallets({ enabled: canRead })
  const { organizations } = useClients({ enabled: canRead && canReadClients })
  const toggleStatus = useToggleClientWalletStatus()

  /** The wallet a movement is being recorded against. */
  const [movementTarget, setMovementTarget] = useState<ClientWallet | null>(null)

  /** Which row is mid-request, so its switch cannot be flipped twice. */
  const [togglingId, setTogglingId] = useState<string | null>(null)

  /**
   * The organisation's name. The wallet may nest it, but if it carries only a
   * `clientId` the label is reconstructed the same way the Clients page does.
   */
  const orgLabelOf = (row: ClientWallet) => {
    if (row.client?.name) return row.client.name
    const id = row.clientId ?? row.client?.id
    return organizations.find((o) => o.id === id)?.label
  }

  function handleToggle(row: ClientWallet) {
    setTogglingId(row.id)
    toggleStatus.mutate(row.id, {
      onSuccess: (updated) => {
        const nowActive = (updated?.status ?? row.status) === 'active'
        toast.success(`Wallet ${nowActive ? 'activated' : 'deactivated'}`)
      },
      onError: (err) => toast.error(errorMessage(err)),
      onSettled: () => setTogglingId(null),
    })
  }

  const columns: DataTableColumn<ClientWallet>[] = [
    {
      header: 'Organisation',
      cell: (row) => (
        <div className="flex items-center gap-2">
          <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" />
          <div>
            <span className="font-medium">{orgLabelOf(row) || 'Unnamed'}</span>
            {row.client?.clientCode && (
              <span className="block font-mono text-xs text-muted-foreground">
                {row.client.clientCode}
              </span>
            )}
          </div>
        </div>
      ),
    },
    {
      header: 'Balance',
      // ⚠️ The field is `amount`, not `balance`, and arrives as a string.
      cell: (row) => (
        <span className="font-medium tabular-nums">{formatAmount(row.amount)}</span>
      ),
    },
    {
      header: 'Status',
      cell: (row) => {
        const isActive = row.status === 'active'
        const isBusy = togglingId === row.id

        // Changing status is an edit; without it the state is read-only.
        if (!canEdit || !row.status) {
          return row.status ? (
            <Badge variant={isActive ? 'default' : 'secondary'}>
              {isActive ? 'Active' : 'Inactive'}
            </Badge>
          ) : (
            <span className="text-xs text-muted-foreground">—</span>
          )
        }

        return (
          <div className="flex items-center gap-2">
            <Switch
              checked={isActive}
              disabled={isBusy}
              onCheckedChange={() => handleToggle(row)}
              aria-label={`${isActive ? 'Deactivate' : 'Activate'} wallet`}
            />
            <span className={cn('text-sm', !isActive && 'text-muted-foreground')}>
              {isActive ? 'Active' : 'Inactive'}
            </span>
          </div>
        )
      },
    },
    ...(canEdit
      ? [
          {
            header: '',
            className: 'text-right',
            // Recording a movement changes the balance, so it is an edit.
            cell: (row: ClientWallet) => (
              <Button
                variant="outline"
                size="sm"
                onClick={(event) => {
                  // The row toggles the ledger; without this the panel would
                  // collapse under the dialog.
                  event.stopPropagation()
                  setMovementTarget(row)
                }}
                title="Record a movement against this wallet"
              >
                <Plus className="size-3.5" />
                Movement
              </Button>
            ),
          },
        ]
      : []),
  ]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight">Client wallets</h1>
        <p className="text-sm text-muted-foreground">
          One wallet per client organisation. Wallets are opened from the Clients page,
          against the organisation they belong to.
        </p>
      </div>

      {!canRead ? (
        <NoAccess resource="client wallets" />
      ) : isError && errorCode(error) === 'FORBIDDEN' ? (
        <NoAccess
          resource="client wallets"
          variant="rejected"
          permission="client.wallets.read"
        />
      ) : isError ? (
        <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {errorMessage(error)}
        </p>
      ) : (
        <DataTable
          columns={columns}
          data={wallets}
          rowKey={(row) => row.id}
          isLoading={isLoading}
          emptyMessage="No wallets yet. Open one from the Clients page, against a client admin."
          getSearchText={(row) =>
            `${orgLabelOf(row) ?? ''} ${row.clientId ?? ''} ${row.status ?? ''}`
          }
          searchPlaceholder="Search wallets…"
          pageSize={15}
          /*
           * The ledger. The element is created per row but the table renders it
           * only once expanded, so no movements are fetched until someone opens
           * a wallet.
           */
          renderExpanded={(row) => (
            <div className="px-4 py-3">
              <WalletLedger walletId={row.id} />
            </div>
          )}
        />
      )}

      <WalletMovementDialog
        open={movementTarget !== null}
        onOpenChange={(open) => {
          if (!open) setMovementTarget(null)
        }}
        wallet={movementTarget}
        canReadAccounts={canReadAccounts}
      />
    </div>
  )
}
