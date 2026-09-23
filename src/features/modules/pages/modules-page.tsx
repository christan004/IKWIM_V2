import { useState } from 'react'
import { ArrowUpDown, KeyRound, Pencil, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { DataTable, type DataTableColumn } from '@/components/data-table'
import { NoAccess } from '@/components/no-access'
import { PERMISSION_MODULES, usePermissions } from '@/hooks/use-permissions'
import { ModuleFormDialog } from '@/features/modules/components/module-form-dialog'
import { ModulePermissionsDialog } from '@/features/modules/components/module-permissions-dialog'
import { ModuleSortingDialog } from '@/features/modules/components/module-sorting-dialog'
import { useDeleteModule, useModules, type ModuleRow } from '@/features/modules/use-modules'
import { errorMessage } from '@/lib/error-message'
import type { ModuleLevel } from '@/api/types'

const LEVEL_LABEL: Record<ModuleLevel, string> = {
  module: 'Module',
  service: 'Service',
  feature: 'Feature',
}

const LEVEL_VARIANT: Record<ModuleLevel, 'default' | 'secondary' | 'outline'> = {
  module: 'default',
  service: 'secondary',
  feature: 'outline',
}

export function ModulesPage() {
  const { canRead, canCreate, canEdit, canDelete } = usePermissions().forModule(
    PERMISSION_MODULES.modules,
  )
  // Skip the request entirely when the user may not read the resource.
  const { rows, parentOptions, isLoading, isError } = useModules({ enabled: canRead })
  const deleteModule = useDeleteModule()
  const [createOpen, setCreateOpen] = useState(false)
  /** The module being renamed, if any. */
  const [editTarget, setEditTarget] = useState<ModuleRow | null>(null)
  const [sortingOpen, setSortingOpen] = useState(false)
  const [permissionsFor, setPermissionsFor] = useState<ModuleRow | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<ModuleRow | null>(null)

  function confirmDelete() {
    if (!deleteTarget) return
    deleteModule.mutate(deleteTarget.id, {
      onSuccess: () => {
        toast.success(`Module "${deleteTarget.name || deleteTarget.code}" deleted`, {
          description:
            deleteTarget.childCount > 0
              ? `${deleteTarget.childCount} child module${deleteTarget.childCount === 1 ? '' : 's'} moved to the top level.`
              : undefined,
        })
        setDeleteTarget(null)
      },
      onError: (err) => toast.error(errorMessage(err)),
    })
  }

  const columns: DataTableColumn<ModuleRow>[] = [
    {
      header: 'Name',
      cell: (row) => (
        // Indented so the hierarchy stays readable once flattened into rows.
        <span className="flex items-center" style={{ paddingLeft: `${row.depth * 1.25}rem` }}>
          {row.depth > 0 && <span className="mr-2 text-muted-foreground">└</span>}
          <span className="font-medium">
            {row.name || <span className="italic text-muted-foreground">(no name)</span>}
          </span>
        </span>
      ),
    },
    {
      header: 'Level',
      cell: (row) => <Badge variant={LEVEL_VARIANT[row.level]}>{LEVEL_LABEL[row.level]}</Badge>,
    },
    {
      header: 'Code',
      cell: (row) =>
        row.code ? (
          <code className="font-mono text-xs">{row.code}</code>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      header: 'Icon',
      cell: (row) =>
        row.icon ? (
          <code className="font-mono text-xs">{row.icon}</code>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      header: 'Parent',
      cell: (row) => row.parentName ?? <span className="text-muted-foreground">—</span>,
    },
    {
      header: 'Permissions',
      cell: (row) => (
        <Button
          variant="ghost"
          size="sm"
          className="gap-1.5"
          onClick={() => setPermissionsFor(row)}
          disabled={row.permissions.length === 0}
          title="View generated permissions"
        >
          <KeyRound className="size-3.5" />
          {row.permissions.length}
        </Button>
      ),
    },
    ...(canEdit || canDelete
      ? [
          {
            header: '',
            className: 'text-right',
            cell: (row: ModuleRow) => (
              <div className="flex justify-end gap-1">
                {canEdit && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setEditTarget(row)}
                    title="Rename module or change its icon"
                  >
                    <Pencil className="size-3.5" />
                  </Button>
                )}
                {canDelete && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive hover:text-destructive"
                    onClick={() => setDeleteTarget(row)}
                    title="Delete module"
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                )}
              </div>
            ),
          },
        ]
      : []),
  ]

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight">Modules</h1>
          <p className="text-sm text-muted-foreground">
            Modules build the sidebar. Nest one under another to create a service, then a
            feature.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {/* Reordering changes existing records, so it is gated on edit
              rather than create. */}
          {canEdit && (
            <Button variant="outline" onClick={() => setSortingOpen(true)}>
              <ArrowUpDown />
              Reorder
            </Button>
          )}
          {canCreate && (
            <Button onClick={() => setCreateOpen(true)}>
              <Plus />
              New module
            </Button>
          )}
        </div>
      </div>

      {!canRead ? (
        <NoAccess resource="modules" />
      ) : isError ? (
        <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          Couldn&rsquo;t load modules.
        </p>
      ) : (
        <DataTable
          columns={columns}
          data={rows}
          rowKey={(row) => row.id}
          isLoading={isLoading}
          emptyMessage="No modules yet. Create the first one to build your sidebar."
          getSearchText={(row) => `${row.name} ${row.code} ${row.parentName ?? ''}`}
          searchPlaceholder="Search modules…"
          pageSize={15}
        />
      )}

      <ModuleFormDialog
        open={editTarget !== null}
        onOpenChange={(open) => {
          if (!open) setEditTarget(null)
        }}
        module={editTarget}
        parentOptions={parentOptions}
      />

      <ModuleFormDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        parentOptions={parentOptions}
      />

      {/* Keyed on open so the working order is rebuilt from the server each
          time, rather than resuming an abandoned edit. */}
      <ModuleSortingDialog
        key={sortingOpen ? 'open' : 'closed'}
        open={sortingOpen}
        onOpenChange={setSortingOpen}
        rows={rows}
      />

      <ModulePermissionsDialog
        module={permissionsFor}
        onOpenChange={(open) => !open && setPermissionsFor(null)}
      />

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title={`Delete "${deleteTarget?.name || deleteTarget?.code}"?`}
        description={
          deleteTarget?.childCount
            ? // Children are promoted rather than deleted, so this is a
              // reshaping of the tree, not a cascade.
              `This also removes its ${deleteTarget.permissions.length} permissions. Its ${deleteTarget.childCount} child module${deleteTarget.childCount === 1 ? '' : 's'} will move to the top level rather than be deleted.`
            : `This also removes its ${deleteTarget?.permissions.length ?? 0} permissions, and any role using them loses them. This cannot be undone.`
        }
        confirmLabel="Delete module"
        variant="destructive"
        onConfirm={confirmDelete}
        isLoading={deleteModule.isPending}
      />
    </div>
  )
}
