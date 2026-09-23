import { useState } from 'react'
import { Pencil, Plus, Trash2, Wallet } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { DataTable, type DataTableColumn } from '@/components/data-table'
import { NoAccess } from '@/components/no-access'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { PERMISSION_MODULES, usePermissions } from '@/hooks/use-permissions'
import { ClientFormDialog } from '@/features/clients/components/client-form-dialog'
import {
  useClients,
  useDeleteClient,
  useToggleClientStatus,
} from '@/features/clients/use-clients'
import {
  useClientWallets,
  useCreateClientWallet,
} from '@/features/client-wallets/use-client-wallets'
import { cn } from '@/lib/utils'
import { errorCode, errorMessage } from '@/lib/error-message'
import type { Client } from '@/api/types'

const POSITION_LABELS: Record<string, string> = {
  clientAdmin: 'Admin',
  clientUser: 'User',
}

export function ClientsPage() {
  const permissions = usePermissions()
  const { canRead, canCreate, canEdit, canDelete } = permissions.forModule(
    PERMISSION_MODULES.clients,
  )
  // Each is gated on its own module's permission, not the clients one.
  const canReadRoles = permissions.forModule(PERMISSION_MODULES.roles).canRead
  const wallets = permissions.forModule(PERMISSION_MODULES.clientWallets)

  const { clients, organizations, isLoading, isError, error } = useClients({ enabled: canRead })
  const toggleStatus = useToggleClientStatus()
  const deleteClient = useDeleteClient()
  // Read so an organisation that already has a wallet is not offered another.
  const { wallets: existingWallets } = useClientWallets({
    enabled: canRead && wallets.canRead,
  })
  const createWallet = useCreateClientWallet()

  const [createOpen, setCreateOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<Client | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Client | null>(null)
  /** Which row is mid-request, so its switch cannot be flipped twice. */
  const [togglingId, setTogglingId] = useState<string | null>(null)
  /** The organisation a wallet is being opened for, so its button can spin. */
  const [openingWalletFor, setOpeningWalletFor] = useState<string | null>(null)

  const nameOf = (row: Client) =>
    `${row.firstName} ${row.lastName}`.trim() || row.email

  /** The organisation label, reconstructed from its admin. */
  const orgLabelOf = (row: Client) =>
    organizations.find((o) => o.id === row.clientId)?.label

  function handleToggle(row: Client) {
    setTogglingId(row.id)
    toggleStatus.mutate(row.id, {
      onSuccess: (updated) => {
        // Status is `isActive` here, not the `status` string used elsewhere.
        const nowActive = updated?.isActive ?? !row.isActive
        toast.success(`${nameOf(row)} ${nowActive ? 'activated' : 'deactivated'}`, {
          description: nowActive ? undefined : 'They can no longer sign in.',
        })
      },
      onError: (err) => toast.error(errorMessage(err)),
      onSettled: () => setTogglingId(null),
    })
  }

  /** Whether this organisation already has a wallet. */
  const walletFor = (clientId: string | null | undefined) =>
    clientId ? existingWallets.find((w) => (w.clientId ?? w.client?.id) === clientId) : undefined

  function handleOpenWallet(row: Client) {
    if (!row.clientId) return
    setOpeningWalletFor(row.clientId)
    createWallet.mutate(
      { clientId: row.clientId },
      {
        onSuccess: () => {
          toast.success(`Wallet opened for ${orgLabelOf(row) || nameOf(row)}`, {
            description: 'It now appears under Client wallets.',
          })
        },
        onError: (err) => {
          // Every wallet route currently 403s despite the permission being
          // held, so the cause is named rather than shown as a bare refusal.
          if (errorCode(err) === 'FORBIDDEN') {
            toast.error('Wallets are not available yet on the server.', {
              description: 'The endpoint refuses even a superAdmin holding every wallet permission.',
            })
            return
          }
          toast.error(errorMessage(err))
        },
        onSettled: () => setOpeningWalletFor(null),
      },
    )
  }

  function handleDelete() {
    if (!deleteTarget) return
    deleteClient.mutate(deleteTarget.id, {
      onSuccess: () => {
        toast.success(`${nameOf(deleteTarget)} deleted`)
        setDeleteTarget(null)
      },
      onError: (err) => toast.error(errorMessage(err)),
    })
  }

  const columns: DataTableColumn<Client>[] = [
    {
      header: 'Name',
      cell: (row) => (
        <div>
          <span className="font-medium">{nameOf(row)}</span>
          <span className="block text-xs text-muted-foreground">{row.email}</span>
        </div>
      ),
    },
    {
      header: 'Organisation',
      // The API lists no organisations, so the label comes from its admin.
      cell: (row) => {
        const label = orgLabelOf(row)
        if (!row.clientId) return <span className="text-xs text-muted-foreground">—</span>
        return (
          <div>
            <span className="text-sm">{label || 'Unnamed'}</span>
            <span className="block font-mono text-xs text-muted-foreground">
              {row.clientId.slice(0, 8)}
            </span>
          </div>
        )
      },
    },
    {
      header: 'Kind',
      cell: (row) => (
        <Badge variant={row.position === 'clientAdmin' ? 'default' : 'secondary'} className="font-normal">
          {POSITION_LABELS[row.position] ?? row.position}
        </Badge>
      ),
    },
    {
      header: 'Role',
      cell: (row) =>
        row.role ? (
          <span className="text-sm">{row.role.name}</span>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        ),
    },
    {
      header: 'Phone',
      cell: (row) =>
        row.phone ? (
          <span className="text-sm tabular-nums">{row.phone}</span>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        ),
    },
    {
      header: 'Status',
      cell: (row) => {
        // ⚠️ `isActive` (boolean), not the `status` string used elsewhere.
        const isActive = row.isActive
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
              aria-label={`${isActive ? 'Deactivate' : 'Activate'} ${nameOf(row)}`}
            />
            <span className={cn('text-sm', !isActive && 'text-muted-foreground')}>
              {isActive ? 'Active' : 'Inactive'}
            </span>
          </div>
        )
      },
    },
    ...(canEdit || canDelete || wallets.canCreate
      ? [
          {
            header: '',
            className: 'text-right',
            cell: (row: Client) => {
              // A wallet belongs to the organisation, and only its admin owns
              // one — offering it on every member would open duplicates.
              const isAdmin = row.position === 'clientAdmin'
              const existing = walletFor(row.clientId)
              const isOpening = openingWalletFor === row.clientId

              return (
              <div className="flex justify-end gap-1">
                {wallets.canCreate && isAdmin && row.clientId && (
                  existing ? (
                    <Badge variant="outline" className="font-normal">
                      <Wallet className="mr-1 size-3" />
                      Wallet
                    </Badge>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={isOpening}
                      onClick={() => handleOpenWallet(row)}
                      title="Open a wallet for this organisation"
                    >
                      <Wallet className="size-3.5" />
                      {isOpening ? 'Opening…' : 'Wallet'}
                    </Button>
                  )
                )}
                {canEdit && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setEditTarget(row)}
                    title="Edit client"
                  >
                    <Pencil className="size-3.5" />
                  </Button>
                )}
                {canDelete && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setDeleteTarget(row)}
                    title="Delete client"
                  >
                    <Trash2 className="size-3.5 text-destructive" />
                  </Button>
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
          <h1 className="font-display text-2xl font-bold tracking-tight">Clients</h1>
          <p className="text-sm text-muted-foreground">
            Client users and the organisations they belong to. A client admin creates an
            organisation; client users join one.
          </p>
        </div>
        {canCreate && (
          <Button onClick={() => setCreateOpen(true)}>
            <Plus />
            New client
          </Button>
        )}
      </div>

      {!canRead ? (
        <NoAccess resource="clients" />
      ) : isError && errorCode(error) === 'FORBIDDEN' ? (
        <NoAccess resource="clients" variant="rejected" permission="clients.read" />
      ) : isError ? (
        <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {errorMessage(error)}
        </p>
      ) : (
        <DataTable
          columns={columns}
          data={clients}
          rowKey={(row) => row.id}
          isLoading={isLoading}
          emptyMessage="No clients yet. Create a client admin to open a new organisation."
          getSearchText={(row) =>
            `${nameOf(row)} ${row.email} ${row.phone ?? ''} ${row.position} ${
              row.role?.name ?? ''
            } ${orgLabelOf(row) ?? ''}`
          }
          searchPlaceholder="Search clients…"
          pageSize={15}
        />
      )}

      <ClientFormDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        organizations={organizations}
        canReadRoles={canReadRoles}
      />

      <ClientFormDialog
        open={editTarget !== null}
        onOpenChange={(open) => {
          if (!open) setEditTarget(null)
        }}
        client={editTarget}
        organizations={organizations}
        canReadRoles={canReadRoles}
      />

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null)
        }}
        title="Delete client?"
        description={
          deleteTarget
            ? `${nameOf(deleteTarget)} will be removed permanently.${
                deleteTarget.position === 'clientAdmin'
                  ? ' They are an admin — their organisation may be left without one.'
                  : ''
              } Deactivate instead to keep the record.`
            : ''
        }
        confirmLabel="Delete"
        variant="destructive"
        isLoading={deleteClient.isPending}
        onConfirm={handleDelete}
      />
    </div>
  )
}
