import { useState } from 'react'
import { Pencil, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { DataTable, type DataTableColumn } from '@/components/data-table'
import { NoAccess } from '@/components/no-access'
import { PERMISSION_MODULES, usePermissions } from '@/hooks/use-permissions'
import { CompanyAccountFormDialog } from '@/features/company-accounts/components/company-account-form-dialog'
import {
  useCompanyAccounts,
  useToggleCompanyAccountStatus,
} from '@/features/company-accounts/use-company-accounts'
import { cn } from '@/lib/utils'
import { errorCode, errorMessage } from '@/lib/error-message'
import type { CompanyAccount } from '@/api/types'

export function CompanyAccountsPage() {
  // Dotted module code — `company.account`, singular.
  const { canRead, canCreate, canEdit } = usePermissions().forModule(
    PERMISSION_MODULES.companyAccounts,
  )

  const { accounts, isLoading, isError, error } = useCompanyAccounts({ enabled: canRead })
  const toggleStatus = useToggleCompanyAccountStatus()

  const [createOpen, setCreateOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<CompanyAccount | null>(null)
  /** Which row is mid-request, so its switch cannot be flipped twice. */
  const [togglingId, setTogglingId] = useState<string | null>(null)

  function handleToggle(account: CompanyAccount) {
    setTogglingId(account.id)
    toggleStatus.mutate(account.id, {
      onSuccess: (updated) => {
        toast.success(
          `${account.name} ${updated?.status === 'active' ? 'activated' : 'deactivated'}`,
          {
            description:
              updated?.status === 'active'
                ? undefined
                : 'It stays on existing records but cannot be chosen for new ones.',
          },
        )
      },
      onError: (err) => toast.error(errorMessage(err)),
      onSettled: () => setTogglingId(null),
    })
  }

  const columns: DataTableColumn<CompanyAccount>[] = [
    {
      header: 'Code',
      // An account code is an identifier, so it reads as one.
      cell: (row) => <span className="font-mono text-sm">{row.code}</span>,
    },
    {
      header: 'Name',
      cell: (row) => <span className="font-medium">{row.name}</span>,
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
              aria-label={`${isActive ? 'Deactivate' : 'Activate'} ${row.name}`}
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
            // There is no delete endpoint, so editing and deactivating are the
            // only correction paths.
            cell: (row: CompanyAccount) => (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setEditTarget(row)}
                title="Edit account"
              >
                <Pencil className="size-3.5" />
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
          <h1 className="font-display text-2xl font-bold tracking-tight">Company accounts</h1>
          <p className="text-sm text-muted-foreground">
            The company's bank accounts, by reference code and name.
          </p>
        </div>
        {canCreate && (
          <Button onClick={() => setCreateOpen(true)}>
            <Plus />
            New account
          </Button>
        )}
      </div>

      {!canRead ? (
        <NoAccess resource="company accounts" />
      ) : isError && errorCode(error) === 'FORBIDDEN' ? (
        <NoAccess resource="company accounts" variant="rejected" permission="company.account.read" />
      ) : isError ? (
        <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {errorMessage(error)}
        </p>
      ) : (
        <DataTable
          columns={columns}
          data={accounts}
          rowKey={(row) => row.id}
          isLoading={isLoading}
          emptyMessage="No company accounts yet. Create one to record a bank account."
          getSearchText={(row) => `${row.code} ${row.name} ${row.status ?? ''}`}
          searchPlaceholder="Search accounts…"
          pageSize={15}
        />
      )}

      <CompanyAccountFormDialog open={createOpen} onOpenChange={setCreateOpen} />

      <CompanyAccountFormDialog
        open={editTarget !== null}
        onOpenChange={(open) => {
          if (!open) setEditTarget(null)
        }}
        account={editTarget}
      />
    </div>
  )
}
