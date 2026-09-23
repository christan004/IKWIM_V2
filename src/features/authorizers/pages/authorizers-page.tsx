import { useState } from 'react'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { DataTable, type DataTableColumn } from '@/components/data-table'
import { NoAccess } from '@/components/no-access'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { PERMISSION_MODULES, usePermissions } from '@/hooks/use-permissions'
import { AuthorizerFormDialog } from '@/features/authorizers/components/authorizer-form-dialog'
import {
  useAuthorizers,
  useDeleteAuthorizer,
  useToggleAuthorizerStatus,
} from '@/features/authorizers/use-authorizers'
import { useRoles } from '@/features/roles/use-roles'
import { cn } from '@/lib/utils'
import { errorCode, errorMessage } from '@/lib/error-message'
import type { Authorizer } from '@/api/types'

/** Reads better than the raw code. */
const TYPE_LABELS: Record<string, string> = { LOADING_ORDER: 'Loading order' }

export function AuthorizersPage() {
  const permissions = usePermissions()
  const { canRead, canCreate, canEdit, canDelete } = permissions.forModule(
    PERMISSION_MODULES.authorizers,
  )
  // Gated on its own module's permission, not the authorizers one.
  const canReadRoles = permissions.forModule(PERMISSION_MODULES.roles).canRead

  const { authorizers, isLoading, isError, error } = useAuthorizers({ enabled: canRead })
  // Only to name a role the list returns as a bare id.
  const { roles } = useRoles({ enabled: canRead && canReadRoles })
  const toggleStatus = useToggleAuthorizerStatus()
  const deleteAuthorizer = useDeleteAuthorizer()

  const [createOpen, setCreateOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<Authorizer | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Authorizer | null>(null)
  /** Which row is mid-request, so its switch cannot be flipped twice. */
  const [togglingId, setTogglingId] = useState<string | null>(null)

  /** Resolves the role whether it arrives nested or as a bare `roleId`. */
  const roleNameOf = (row: Authorizer) =>
    row.role?.name ?? roles.find((r) => r.id === row.roleId)?.name

  function handleToggle(row: Authorizer) {
    const label = roleNameOf(row) ?? 'Authorizer'
    setTogglingId(row.id)
    toggleStatus.mutate(row.id, {
      onSuccess: (updated) => {
        toast.success(`${label} ${updated?.status === 'active' ? 'activated' : 'deactivated'}`, {
          description:
            updated?.status === 'active'
              ? undefined
              : 'This role can no longer authorise, but past approvals stand.',
        })
      },
      onError: (err) => toast.error(errorMessage(err)),
      onSettled: () => setTogglingId(null),
    })
  }

  function handleDelete() {
    if (!deleteTarget) return
    deleteAuthorizer.mutate(deleteTarget.id, {
      onSuccess: () => {
        toast.success('Authorizer deleted')
        setDeleteTarget(null)
      },
      onError: (err) => toast.error(errorMessage(err)),
    })
  }

  const columns: DataTableColumn<Authorizer>[] = [
    {
      header: 'Level',
      // The chain reads in order, so the level leads rather than the role.
      cell: (row) => (
        <span className="inline-flex size-7 items-center justify-center rounded-full border text-sm font-medium tabular-nums">
          {row.levels}
        </span>
      ),
    },
    {
      header: 'Role',
      cell: (row) => {
        const name = roleNameOf(row)
        return name ? (
          <span className="font-medium">{name}</span>
        ) : (
          // Not a fault: the role may simply be unreadable to this user.
          <span className="text-muted-foreground">—</span>
        )
      },
    },
    {
      header: 'Authorises',
      cell: (row) => (
        <Badge variant="secondary" className="font-normal">
          {TYPE_LABELS[row.type] ?? row.type}
        </Badge>
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
              aria-label={`${isActive ? 'Deactivate' : 'Activate'} ${roleNameOf(row) ?? 'authorizer'}`}
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
            cell: (row: Authorizer) => (
              <div className="flex justify-end gap-1">
                {canEdit && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setEditTarget(row)}
                    title="Edit authorizer"
                  >
                    <Pencil className="size-3.5" />
                  </Button>
                )}
                {canDelete && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setDeleteTarget(row)}
                    title="Delete authorizer"
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

  /** Lowest level first — the order approvals actually happen in. */
  const ordered = [...authorizers].sort((a, b) => (a.levels ?? 0) - (b.levels ?? 0))

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight">Authorizers</h1>
          <p className="text-sm text-muted-foreground">
            Which roles may sign off a loading order, and in what order. Authority belongs to
            the role, so anyone holding it can approve.
          </p>
        </div>
        {canCreate && (
          <Button onClick={() => setCreateOpen(true)}>
            <Plus />
            New authorizer
          </Button>
        )}
      </div>

      {!canRead ? (
        <NoAccess resource="authorizers" />
      ) : isError && errorCode(error) === 'FORBIDDEN' ? (
        <NoAccess resource="authorizers" variant="rejected" permission="authorizers.read" />
      ) : isError ? (
        <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {errorMessage(error)}
        </p>
      ) : (
        <DataTable
          columns={columns}
          data={ordered}
          rowKey={(row) => row.id}
          isLoading={isLoading}
          emptyMessage="No authorizers yet. Add one to decide who signs off a loading order."
          getSearchText={(row) =>
            `${roleNameOf(row) ?? ''} ${row.type} ${row.levels} ${row.status ?? ''}`
          }
          searchPlaceholder="Search authorizers…"
          pageSize={15}
        />
      )}

      <AuthorizerFormDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        canReadRoles={canReadRoles}
      />

      <AuthorizerFormDialog
        open={editTarget !== null}
        onOpenChange={(open) => {
          if (!open) setEditTarget(null)
        }}
        authorizer={editTarget}
        canReadRoles={canReadRoles}
      />

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null)
        }}
        title="Delete authorizer?"
        description={
          deleteTarget
            ? `${roleNameOf(deleteTarget) ?? 'This role'} will no longer authorise at level ${
                deleteTarget.levels
              }. Deactivate instead to keep the record.`
            : ''
        }
        confirmLabel="Delete"
        variant="destructive"
        isLoading={deleteAuthorizer.isPending}
        onConfirm={handleDelete}
      />
    </div>
  )
}
