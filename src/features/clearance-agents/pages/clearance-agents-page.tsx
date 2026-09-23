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
import { ClearanceAgentFormDialog } from '@/features/clearance-agents/components/clearance-agent-form-dialog'
import {
  useClearanceAgents,
  useDeleteClearanceAgent,
  useToggleClearanceAgentStatus,
} from '@/features/clearance-agents/use-clearance-agents'
import { cn } from '@/lib/utils'
import { errorCode, errorMessage } from '@/lib/error-message'
import type { ClearanceAgent } from '@/api/types'

/** `fees` arrives as a string, so it is parsed before formatting. */
function formatFee(value: string | number | undefined): string {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed.toLocaleString() : '—'
}

export function ClearanceAgentsPage() {
  // Module code is `clearance.agent`, though the route is `/clearing-agents`.
  const { canRead, canCreate, canEdit, canDelete } = usePermissions().forModule(
    PERMISSION_MODULES.clearanceAgents,
  )

  const { agents, isLoading, isError, error } = useClearanceAgents({ enabled: canRead })
  const toggleStatus = useToggleClearanceAgentStatus()
  const deleteAgent = useDeleteClearanceAgent()

  const [createOpen, setCreateOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<ClearanceAgent | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<ClearanceAgent | null>(null)
  /** Which row is mid-request, so its switch cannot be flipped twice. */
  const [togglingId, setTogglingId] = useState<string | null>(null)

  function handleToggle(agent: ClearanceAgent) {
    setTogglingId(agent.id)
    toggleStatus.mutate(agent.id, {
      onSuccess: (updated) => {
        toast.success(
          `${agent.names} ${updated?.status === 'active' ? 'activated' : 'deactivated'}`,
          {
            description:
              updated?.status === 'active'
                ? undefined
                : 'They stay on existing clearances but cannot be chosen for new ones.',
          },
        )
      },
      onError: (err) => toast.error(errorMessage(err)),
      onSettled: () => setTogglingId(null),
    })
  }

  function handleDelete() {
    if (!deleteTarget) return
    deleteAgent.mutate(deleteTarget.id, {
      onSuccess: () => {
        toast.success(`${deleteTarget.names} deleted`)
        setDeleteTarget(null)
      },
      onError: (err) => toast.error(errorMessage(err)),
    })
  }

  const columns: DataTableColumn<ClearanceAgent>[] = [
    {
      header: 'Agent',
      cell: (row) => <span className="font-medium">{row.names}</span>,
    },
    {
      header: 'Fee',
      cell: (row) => <span className="tabular-nums">{formatFee(row.fees)}</span>,
    },
    {
      header: 'Status',
      cell: (row) => {
        const isActive = row.status === 'active'
        // The status endpoint flips rather than sets, so a second call while one
        // is in flight would silently undo the first.
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
              aria-label={`${isActive ? 'Deactivate' : 'Activate'} ${row.names}`}
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
            cell: (row: ClearanceAgent) => (
              <div className="flex justify-end gap-1">
                {canEdit && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setEditTarget(row)}
                    title="Edit agent"
                  >
                    <Pencil className="size-3.5" />
                  </Button>
                )}
                {/* Unlike most reference tables here, this one does have a
                    delete endpoint. It is a hard delete, so it is confirmed. */}
                {canDelete && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setDeleteTarget(row)}
                    title="Delete agent"
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

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight">Clearance agents</h1>
          <p className="text-sm text-muted-foreground">
            Agents who clear stock through customs, and the fee each charges.
          </p>
        </div>
        {canCreate && (
          <Button onClick={() => setCreateOpen(true)}>
            <Plus />
            New agent
          </Button>
        )}
      </div>

      {!canRead ? (
        <NoAccess resource="clearance agents" />
      ) : isError && errorCode(error) === 'FORBIDDEN' ? (
        <NoAccess resource="clearance agents" variant="rejected" permission="clearance.agent.read" />
      ) : isError ? (
        <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {errorMessage(error)}
        </p>
      ) : (
        <DataTable
          columns={columns}
          data={agents}
          rowKey={(row) => row.id}
          isLoading={isLoading}
          emptyMessage="No clearance agents yet. Create one to record who clears stock through customs."
          getSearchText={(row) => `${row.names} ${row.fees} ${row.status}`}
          searchPlaceholder="Search agents…"
          pageSize={15}
        />
      )}

      <ClearanceAgentFormDialog open={createOpen} onOpenChange={setCreateOpen} />

      <ClearanceAgentFormDialog
        open={editTarget !== null}
        onOpenChange={(open) => {
          if (!open) setEditTarget(null)
        }}
        agent={editTarget}
      />

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null)
        }}
        title="Delete clearance agent?"
        description={
          deleteTarget
            ? `${deleteTarget.names} will be removed permanently. Deactivate instead if they may be used again.`
            : ''
        }
        confirmLabel="Delete"
        variant="destructive"
        isLoading={deleteAgent.isPending}
        onConfirm={handleDelete}
      />
    </div>
  )
}
