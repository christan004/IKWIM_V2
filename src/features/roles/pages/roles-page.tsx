import { useState } from "react";
import { KeyRound, Lock, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataTable, type DataTableColumn } from "@/components/data-table";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { NoAccess } from "@/components/no-access";
import { PERMISSION_MODULES, usePermissions } from "@/hooks/use-permissions";
import { RoleFormDialog } from "@/features/roles/components/role-form-dialog";
import { RolePermissionsDialog } from "@/features/roles/components/role-permissions-dialog";
import { useDeleteRole, useRoles } from "@/features/roles/use-roles";
import { errorMessage } from "@/lib/error-message";
import type { RoleEntity } from "@/api/types";

export function RolesPage() {
  const { canRead, canCreate, canEdit, canDelete } = usePermissions().forModule(
    PERMISSION_MODULES.roles,
  );
  // Skip the request entirely when the user may not read the resource.
  const { roles, isLoading, isError } = useRoles({ enabled: canRead });
  const deleteRole = useDeleteRole();

  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<RoleEntity | null>(null);
  const [permissionsFor, setPermissionsFor] = useState<RoleEntity | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<RoleEntity | null>(null);

  function confirmDelete() {
    if (!deleteTarget) return;
    deleteRole.mutate(deleteTarget.id, {
      onSuccess: () => {
        toast.success(`Role "${deleteTarget.name}" deleted`);
        setDeleteTarget(null);
      },
      onError: (err) => toast.error(errorMessage(err)),
    });
  }

  const columns: DataTableColumn<RoleEntity>[] = [
    {
      header: "Name",
      cell: (role) => (
        <span className="flex items-center gap-2">
          <span className="font-medium">{role.name}</span>
          {role.isFixed && (
            <Badge variant="outline" className="gap-1 text-xs">
              <Lock className="size-3" />
              System
            </Badge>
          )}
        </span>
      ),
    },
    {
      header: "Status",
      cell: (role) => (
        <Badge variant={role.isActive ? "default" : "secondary"}>
          {role.isActive ? "Active" : "Inactive"}
        </Badge>
      ),
    },
    {
      header: "Permissions",
      cell: (role) => (
        <Button
          variant="ghost"
          size="sm"
          className="gap-1.5"
          onClick={() => setPermissionsFor(role)}
          title="View assigned permissions"
        >
          <KeyRound className="size-3.5" />
          {role.permissions?.length ?? 0}
        </Button>
      ),
    },
    {
      header: "Created",
      cell: (role) => (
        <span className="text-sm text-muted-foreground">
          {new Date(role.createdAt).toLocaleDateString()}
        </span>
      ),
    },
    ...(canEdit || canDelete
      ? [
          {
            header: "",
            className: "text-right",
            cell: (role: RoleEntity) => (
              <div className="flex items-center justify-end gap-1">
                {canEdit && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setEditTarget(role)}
                    title="Edit role"
                  >
                    <Pencil className="size-3.5" />
                  </Button>
                )}
                {/* Deleting a fixed role is rejected by the API (409), so the
                    action is hidden rather than offered and then refused. */}
                {canDelete && !role.isFixed && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive hover:text-destructive"
                    onClick={() => setDeleteTarget(role)}
                    title="Delete role"
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                )}
              </div>
            ),
          },
        ]
      : []),
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight">
            Roles
          </h1>
          <p className="text-sm text-muted-foreground">
            A role bundles permissions. Assign one to a user to control what
            they can do.
          </p>
        </div>
        {canCreate && (
          <Button onClick={() => setCreateOpen(true)}>
            <Plus />
            New role
          </Button>
        )}
      </div>

      {!canRead ? (
        <NoAccess resource="roles" />
      ) : isError ? (
        <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          Couldn&rsquo;t load roles.
        </p>
      ) : (
        <DataTable
          columns={columns}
          data={roles}
          rowKey={(role) => role.id}
          isLoading={isLoading}
          emptyMessage="No roles yet. Create the first one to start assigning permissions."
          getSearchText={(role) => role.name}
          searchPlaceholder="Search roles…"
          getIsActive={(role) => role.isActive}
          pageSize={15}
        />
      )}

      <RoleFormDialog open={createOpen} onOpenChange={setCreateOpen} />

      {/* Keyed by role id so the form re-seeds when a different role is opened. */}
      <RoleFormDialog
        key={editTarget?.id ?? "edit"}
        open={Boolean(editTarget)}
        onOpenChange={(open) => !open && setEditTarget(null)}
        role={editTarget}
      />

      <RolePermissionsDialog
        role={permissionsFor}
        onOpenChange={(open) => !open && setPermissionsFor(null)}
      />

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title={`Delete "${deleteTarget?.name}"?`}
        description="This cannot be undone. Users assigned to this role will lose its permissions."
        confirmLabel="Delete role"
        variant="destructive"
        onConfirm={confirmDelete}
        isLoading={deleteRole.isPending}
      />
    </div>
  );
}
