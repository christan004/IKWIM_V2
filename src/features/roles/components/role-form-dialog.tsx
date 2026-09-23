import { useEffect, useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { Lock, Search } from 'lucide-react'
import { FormDialog } from '@/components/form-dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { DialogFooter } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { errorCode, errorMessage, fieldErrors } from '@/lib/error-message'
import {
  useAssignPermissions,
  useCreateRole,
  usePermissionTree,
} from '@/features/roles/use-roles'
import {
  countSelected,
  isManage,
  isModuleFullySelected,
  toggleModule,
  togglePermission,
} from '@/features/roles/permission-rules'
import type { ModulePermission, RoleEntity } from '@/api/types'

const schema = z.object({
  name: z.string().trim().min(1, 'Name is required'),
})

type RoleForm = z.infer<typeof schema>

export function RoleFormDialog({
  open,
  onOpenChange,
  /** Pass a role to edit it; omit to create a new one. */
  role,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  role?: RoleEntity | null
}) {
  const createRole = useCreateRole()
  const assignPermissions = useAssignPermissions()
  const { nodes, isLoading: permissionsLoading } = usePermissionTree()

  const isEdit = Boolean(role)
  const isPending = createRole.isPending || assignPermissions.isPending

  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [filter, setFilter] = useState('')

  /**
   * Permissions the role already holds. The assign endpoint is additive only —
   * it cannot revoke — so these are shown ticked and locked rather than
   * offering an untick that would silently do nothing.
   */
  const granted = useMemo(
    () => new Set((role?.permissions ?? []).map((link) => link.permissionId)),
    [role],
  )

  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors },
  } = useForm<RoleForm>({ resolver: zodResolver(schema), defaultValues: { name: '' } })

  // Seed from the role being edited, or clear for a new one, each time the
  // dialog opens — so a previous attempt never leaks into the next.
  useEffect(() => {
    if (!open) return
    reset({ name: role?.name ?? '' })
    setSelected(new Set((role?.permissions ?? []).map((link) => link.permissionId)))
    setFilter('')
  }, [open, role, reset])

  const visibleNodes = useMemo(() => {
    const query = filter.trim().toLowerCase()
    if (!query) return nodes
    return nodes
      .map((node) => ({
        ...node,
        permissions: node.permissions.filter(
          (p) =>
            p.name.toLowerCase().includes(query) ||
            p.code.toLowerCase().includes(query) ||
            node.path.toLowerCase().includes(query),
        ),
      }))
      .filter((node) => node.permissions.length > 0)
  }, [nodes, filter])

  const fullModules = useMemo(
    () => nodes.filter((node) => isModuleFullySelected(selected, node.permissions)).length,
    [nodes, selected],
  )

  function toggle(permissionId: string) {
    // An already-granted permission cannot be revoked through this endpoint.
    if (granted.has(permissionId)) return
    setSelected((prev) => togglePermission(prev, permissionId))
  }

  function toggleAll(modulePermissions: ModulePermission[], select: boolean) {
    // Clearing must not drop already-granted ids: they would be re-sent anyway,
    // and unticking them in the UI would imply a revoke that cannot happen.
    const changeable = modulePermissions.filter((p) => !granted.has(p.id))
    setSelected((prev) => toggleModule(prev, changeable, select))
  }

  function handleError(err: unknown) {
    const nameError = fieldErrors(err)?.name
    if (nameError) {
      setError('name', { message: nameError })
      return
    }
    if (errorCode(err) === 'RESOURCE_CONFLICT') {
      setError('name', { message: 'A role with this name already exists.' })
      return
    }
    // An unknown permission id comes back as RELATION_CONFLICT, which is not
    // about the name — surface it as a toast instead.
    toast.error(errorMessage(err))
  }

  function onSubmit(values: RoleForm) {
    const name = values.name.trim()
    const permissionIds = [...selected]

    if (isEdit && role) {
      assignPermissions.mutate(
        {
          roleId: role.id,
          permissionIds,
          // Always the intended name: the endpoint writes this verbatim, so an
          // empty string would blank the role's name rather than leave it be.
          name,
        },
        {
          onSuccess: () => {
            const added = permissionIds.filter((id) => !granted.has(id)).length
            toast.success(`Role "${name}" updated`, {
              description:
                added > 0
                  ? `${added} permission${added === 1 ? '' : 's'} granted.`
                  : 'No new permissions granted.',
            })
            onOpenChange(false)
          },
          onError: handleError,
        },
      )
      return
    }

    createRole.mutate(
      {
        name,
        // Omit the key entirely when nothing is selected — the API treats
        // permissionIds as optional.
        ...(permissionIds.length > 0 ? { permissionIds } : {}),
      },
      {
        onSuccess: (created) => {
          toast.success(`Role "${created?.name ?? name}" created`, {
            description:
              permissionIds.length > 0
                ? `${permissionIds.length} permission${permissionIds.length === 1 ? '' : 's'} assigned.`
                : 'No permissions assigned yet.',
          })
          onOpenChange(false)
        },
        onError: handleError,
      },
    )
  }

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={isEdit ? `Edit ${role?.name}` : 'New role'}
      description={
        isEdit
          ? 'Rename the role or grant it more permissions. Existing permissions cannot be removed.'
          : 'Name the role, then choose what it can do.'
      }
    >
      <form onSubmit={handleSubmit(onSubmit)} className="grid gap-4">
        <div className="grid gap-1.5">
          <Label htmlFor="name">Name</Label>
          <Input id="name" placeholder="Manager" {...register('name')} />
          {errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
        </div>

        <div className="grid gap-2">
          <div className="flex items-center justify-between">
            <Label>Permissions</Label>
            <span className="text-xs text-muted-foreground">
              {selected.size} selected
              {fullModules > 0 &&
                ` · ${fullModules} module${fullModules === 1 ? '' : 's'} in full`}
            </span>
          </div>

          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Filter permissions…"
              className="h-8 pl-8 text-sm"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            />
          </div>

          <div className="max-h-64 space-y-3 overflow-y-auto rounded-md border p-3">
            {permissionsLoading ? (
              <p className="py-4 text-center text-sm text-muted-foreground">
                Loading permissions…
              </p>
            ) : visibleNodes.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">
                {filter ? 'No permissions match that filter.' : 'No permissions available.'}
              </p>
            ) : (
              visibleNodes.map((node) => {
                const full = isModuleFullySelected(selected, node.permissions)
                const count = countSelected(selected, node.permissions)

                return (
                  <div
                    key={node.id}
                    className="space-y-1.5"
                    // Indented by depth, matching the modules table.
                    style={{ paddingLeft: `${node.depth * 1}rem` }}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="flex min-w-0 items-center text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        {node.depth > 0 && <span className="mr-1.5 normal-case">└</span>}
                        <span className="truncate">{node.name || '(no name)'}</span>
                        {count > 0 && (
                          <span className="ml-2 shrink-0 rounded bg-primary/10 px-1.5 text-[10px] font-medium normal-case text-primary">
                            {count}/{node.permissions.length}
                          </span>
                        )}
                      </p>
                      <button
                        type="button"
                        onClick={() => toggleAll(node.permissions, !full)}
                        className="shrink-0 text-xs text-primary underline-offset-2 hover:underline"
                      >
                        {full ? 'Clear' : 'Select all'}
                      </button>
                    </div>

                    <div className="grid gap-1">
                      {node.permissions.map((permission) => {
                        const manage = isManage(permission.code)
                        const locked = granted.has(permission.id)

                        return (
                          <label
                            key={permission.id}
                            title={
                              locked
                                ? 'Already granted — the API cannot revoke a permission'
                                : undefined
                            }
                            className={cn(
                              'flex items-center gap-2 rounded px-1.5 py-1 text-sm',
                              locked ? 'cursor-not-allowed' : 'cursor-pointer hover:bg-accent',
                              // Manage is the broadest grant on a module, so it
                              // is marked out rather than left to blend into the
                              // list. It is still an ordinary, independent
                              // checkbox — see permission-rules.ts.
                              manage && 'bg-primary/5 font-medium',
                            )}
                          >
                            <input
                              type="checkbox"
                              className="size-3.5 accent-primary"
                              checked={selected.has(permission.id)}
                              disabled={locked}
                              onChange={() => toggle(permission.id)}
                            />
                            <span
                              className={cn('flex-1 truncate', locked && 'text-muted-foreground')}
                            >
                              {permission.name}
                              {manage && (
                                <span className="ml-1.5 rounded bg-primary/10 px-1 text-[10px] font-medium text-primary">
                                  full control
                                </span>
                              )}
                              {locked && (
                                <Lock className="ml-1.5 inline size-3 text-muted-foreground" />
                              )}
                            </span>
                            <code className="shrink-0 font-mono text-[10px] text-muted-foreground">
                              {permission.code}
                            </code>
                          </label>
                        )
                      })}
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" disabled={isPending}>
            {isPending
              ? isEdit
                ? 'Saving…'
                : 'Creating…'
              : isEdit
                ? 'Save changes'
                : 'Create role'}
          </Button>
        </DialogFooter>
      </form>
    </FormDialog>
  )
}
