import { useState } from 'react'
import { Building2, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { DataTable, type DataTableColumn } from '@/components/data-table'
import { NoAccess } from '@/components/no-access'
import { PERMISSION_MODULES, usePermissions } from '@/hooks/use-permissions'
import { UserFormDialog } from '@/features/users/components/user-form-dialog'
import { AssignSiteDialog } from '@/features/users/components/assign-site-dialog'
import { useToggleUserStatus, useUsers } from '@/features/users/use-users'
import { useSites } from '@/features/pss/use-pss'
import { useAuthStore } from '@/stores/auth-store'
import { cn } from '@/lib/utils'
import { errorCode, errorMessage } from '@/lib/error-message'
import { fullName } from '@/api/types'
import type { User } from '@/api/types'

/** Matches the dialog's labels, so the table and form read the same. */
const POSITION_LABEL: Record<string, string> = {
  superAdmin: 'Super admin',
  siteManager: 'Site manager',
  clientAdmin: 'Client admin',
  clientUser: 'Client user',
}

export function UsersPage() {
  const permissions = usePermissions()
  const { canRead, canCreate, canEdit } = permissions.forModule(PERMISSION_MODULES.users)
  // Sites belong to the PSS module, so the picker is gated on its permission
  // rather than the users one.
  const canReadSites = permissions.forModule(PERMISSION_MODULES.pss).canRead
  // Skip the request entirely when the user may not read the resource.
  const { users, isLoading, isError, error } = useUsers({ enabled: canRead })
  // Only to name the assigned site — the user record carries a bare `siteId`.
  const { sites } = useSites({ enabled: canRead && canReadSites })
  const toggleStatus = useToggleUserStatus()
  const currentUserId = useAuthStore((s) => s.user?.id)
  const [createOpen, setCreateOpen] = useState(false)
  /** The user whose site assignment is open; `null` closes the dialog. */
  const [assignTo, setAssignTo] = useState<User | null>(null)
  /** Which row is mid-request, so its switch can't be flipped twice. */
  const [togglingId, setTogglingId] = useState<string | null>(null)

  const isForbidden = errorCode(error) === 'FORBIDDEN'

  function handleToggle(user: User) {
    setTogglingId(user.id)
    toggleStatus.mutate(user.id, {
      onSuccess: (updated) => {
        toast.success(
          `${fullName(user)} ${updated?.isActive ? 'activated' : 'deactivated'}`,
          {
            description: updated?.isActive
              ? undefined
              : 'They can no longer sign in to the console.',
          },
        )
      },
      onError: (err) => toast.error(errorMessage(err)),
      onSettled: () => setTogglingId(null),
    })
  }

  const columns: DataTableColumn<User>[] = [
    {
      header: 'Name',
      cell: (user) => <span className="font-medium">{fullName(user)}</span>,
    },
    { header: 'Email', cell: (user) => user.email },
    {
      header: 'Phone',
      cell: (user) => user.phone ?? <span className="text-muted-foreground">—</span>,
    },
    {
      header: 'Role',
      cell: (user) => <Badge variant="secondary">{user.role?.name ?? '—'}</Badge>,
    },
    {
      header: 'Status',
      cell: (user) => {
        const isSelf = user.id === currentUserId
        // The endpoint flips the flag rather than setting it, so a second call
        // while one is in flight would silently undo the first.
        const isBusy = togglingId === user.id

        // Changing status is an edit; without it the state is read-only.
        if (!canEdit) {
          return (
            <Badge variant={user.isActive ? 'default' : 'secondary'}>
              {user.isActive ? 'Active' : 'Inactive'}
            </Badge>
          )
        }

        return (
          <div className="flex items-center gap-2">
            <Switch
              checked={user.isActive}
              disabled={isSelf || isBusy}
              onCheckedChange={() => handleToggle(user)}
              aria-label={`${user.isActive ? 'Deactivate' : 'Activate'} ${user.email}`}
            />
            <span
              className={cn(
                'text-sm',
                user.isActive ? 'text-foreground' : 'text-muted-foreground',
              )}
            >
              {user.isActive ? 'Active' : 'Inactive'}
            </span>
            {isSelf && (
              <Badge variant="outline" className="text-xs">
                You
              </Badge>
            )}
          </div>
        )
      },
    },
    {
      header: 'Site',
      // The record carries a bare `siteId`, so the name comes from the sites
      // list — which the user may not be permitted to read.
      cell: (user) => {
        if (!user.siteId) return <span className="text-xs text-muted-foreground">—</span>
        const site = sites.find((s) => s.id === user.siteId)
        return (
          <div>
            <span className="text-sm">{site?.name ?? 'Assigned'}</span>
            {user.position && (
              <span className="block text-xs text-muted-foreground">
                {POSITION_LABEL[user.position] ?? user.position}
              </span>
            )}
          </div>
        )
      },
    },
    {
      header: 'Created',
      cell: (user) => (
        <span className="text-sm text-muted-foreground">
          {new Date(user.createdAt).toLocaleDateString()}
        </span>
      ),
    },
    ...(canEdit
      ? [
          {
            header: '',
            className: 'text-right',
            cell: (user: User) => (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setAssignTo(user)}
                title={user.siteId ? 'Change site assignment' : 'Assign to a site'}
              >
                <Building2 className="size-3.5" />
                {user.siteId ? 'Reassign' : 'Assign site'}
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
          <h1 className="font-display text-2xl font-bold tracking-tight">Users</h1>
          <p className="text-sm text-muted-foreground">
            People who can sign in to the console. Each one is assigned a role.
          </p>
        </div>
        {canCreate && (
          <Button onClick={() => setCreateOpen(true)}>
            <Plus />
            New user
          </Button>
        )}
      </div>

      {!canRead ? (
        <NoAccess resource="users" />
      ) : isForbidden ? (
        // The role grants users.read, but the API refused anyway — a
        // server-side gating mismatch, not a missing grant.
        <NoAccess resource="users" variant="rejected" permission="users.read" />
      ) : isError ? (
        <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {errorMessage(error)}
        </p>
      ) : (
        <DataTable
          columns={columns}
          data={users}
          rowKey={(user) => user.id}
          isLoading={isLoading}
          emptyMessage="No users yet. Create the first one to give someone access."
          getSearchText={(user) => `${fullName(user)} ${user.email} ${user.role?.name ?? ''}`}
          searchPlaceholder="Search users…"
          getIsActive={(user) => user.isActive}
          pageSize={15}
        />
      )}

      <UserFormDialog open={createOpen} onOpenChange={setCreateOpen} />

      {/* Keyed by user so the form reseeds when a different row is opened. */}
      <AssignSiteDialog
        key={assignTo?.id ?? 'assign'}
        user={assignTo}
        onOpenChange={(open) => !open && setAssignTo(null)}
        canReadSites={canReadSites}
      />
    </div>
  )
}
