import { useState } from 'react'
import { Pencil, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { DataTable, type DataTableColumn } from '@/components/data-table'
import { NoAccess } from '@/components/no-access'
import { PERMISSION_MODULES, usePermissions } from '@/hooks/use-permissions'
import { SupplierTypeFormDialog } from '@/features/suppliers/components/supplier-type-form-dialog'
import {
  useSupplierTypes,
  useToggleSupplierTypeStatus,
} from '@/features/suppliers/use-supplier-types'
import { cn } from '@/lib/utils'
import { errorCode, errorMessage } from '@/lib/error-message'
import type { SupplierType } from '@/api/types'

export function SupplierTypesPage() {
  const { canRead, canCreate, canEdit } = usePermissions().forModule(
    PERMISSION_MODULES.supplierTypes,
  )
  // Skip the request entirely when the user may not read the resource.
  const { types, isLoading, isError, error } = useSupplierTypes({ enabled: canRead })
  const toggleStatus = useToggleSupplierTypeStatus()

  const [createOpen, setCreateOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<SupplierType | null>(null)
  /** Which row is mid-request, so its switch can't be flipped twice. */
  const [togglingId, setTogglingId] = useState<string | null>(null)

  function handleToggle(supplierType: SupplierType) {
    setTogglingId(supplierType.id)
    toggleStatus.mutate(supplierType.id, {
      onSuccess: (updated) => {
        toast.success(
          `${supplierType.type} ${updated?.status === 'active' ? 'activated' : 'deactivated'}`,
          {
            description:
              updated?.status === 'active'
                ? undefined
                : 'It stays on existing suppliers but cannot be chosen for new ones.',
          },
        )
      },
      onError: (err) => toast.error(errorMessage(err)),
      onSettled: () => setTogglingId(null),
    })
  }

  const columns: DataTableColumn<SupplierType>[] = [
    {
      header: 'Type',
      cell: (row) => <span className="font-mono font-medium">{row.type}</span>,
    },
    {
      header: 'Status',
      cell: (row) => {
        const isActive = row.status === 'active'
        // The status endpoints in this API flip rather than set, so a second
        // call while one is in flight would silently undo the first.
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
              aria-label={`${isActive ? 'Deactivate' : 'Activate'} ${row.type}`}
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
            // There is no delete endpoint, so editing is the only correction path.
            cell: (row: SupplierType) => (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setEditTarget(row)}
                title="Edit type"
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
          <h1 className="font-display text-2xl font-bold tracking-tight">Supplier types</h1>
          <p className="text-sm text-muted-foreground">
            How suppliers are classified, for example FOREIGN or LOCAL.
          </p>
        </div>
        {canCreate && (
          <Button onClick={() => setCreateOpen(true)}>
            <Plus />
            New type
          </Button>
        )}
      </div>

      {!canRead ? (
        <NoAccess resource="supplier types" />
      ) : isError && errorCode(error) === 'FORBIDDEN' ? (
        // The role grants suppliers.type.read, but the API refused anyway — a
        // server-side gating mismatch, not a missing grant.
        <NoAccess resource="supplier types" variant="rejected" permission="suppliers.type.read" />
      ) : isError ? (
        <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {errorMessage(error)}
        </p>
      ) : (
        <DataTable
          columns={columns}
          data={types}
          rowKey={(row) => row.id}
          isLoading={isLoading}
          emptyMessage="No supplier types yet. Create the first one to classify suppliers."
          getSearchText={(row) => row.type}
          searchPlaceholder="Search types…"
          getIsActive={(row) => row.status === 'active'}
          pageSize={15}
        />
      )}

      <SupplierTypeFormDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        existingTypes={types}
      />

      {/* Keyed by id so the form re-seeds when a different row is opened. */}
      <SupplierTypeFormDialog
        key={editTarget?.id ?? 'edit'}
        open={Boolean(editTarget)}
        onOpenChange={(open) => !open && setEditTarget(null)}
        supplierType={editTarget}
        existingTypes={types}
      />
    </div>
  )
}
