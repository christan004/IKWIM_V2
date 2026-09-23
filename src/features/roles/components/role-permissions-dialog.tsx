import { useMemo } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import type { RoleEntity } from '@/api/types'

/** A read-only summary. Use the Edit action to change what a role can do. */
export function RolePermissionsDialog({
  role,
  onOpenChange,
}: {
  role: RoleEntity | null
  onOpenChange: (open: boolean) => void
}) {
  const permissions = useMemo(
    () =>
      [...(role?.permissions ?? [])]
        .map((link) => link.permission)
        .sort((a, b) => a.code.localeCompare(b.code)),
    [role],
  )

  return (
    <Dialog open={Boolean(role)} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{role?.name} permissions</DialogTitle>
          <DialogDescription>
            {permissions.length} permission{permissions.length === 1 ? '' : 's'} assigned to
            this role.
          </DialogDescription>
        </DialogHeader>

        {permissions.length > 0 ? (
          <ul className="max-h-80 space-y-2 overflow-y-auto">
            {permissions.map((permission) => (
              <li
                key={permission.id}
                className="flex items-center justify-between gap-3 rounded-md border px-3 py-2"
              >
                <span className="truncate text-sm font-medium">{permission.name}</span>
                <Badge variant="secondary" className="shrink-0 font-mono text-xs">
                  {permission.code}
                </Badge>
              </li>
            ))}
          </ul>
        ) : (
          <p className="py-4 text-center text-sm text-muted-foreground">
            This role has no permissions yet.
          </p>
        )}
      </DialogContent>
    </Dialog>
  )
}
