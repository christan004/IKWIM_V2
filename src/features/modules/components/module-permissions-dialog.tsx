import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import type { ModuleRow } from '@/features/modules/use-modules'

/**
 * The backend generates a fixed set of permissions per module (read, create,
 * edit, delete, manage). They are read-only here — there is no endpoint to
 * change them.
 */
export function ModulePermissionsDialog({
  module: moduleRow,
  onOpenChange,
}: {
  module: ModuleRow | null
  onOpenChange: (open: boolean) => void
}) {
  return (
    <Dialog open={Boolean(moduleRow)} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{moduleRow?.name} permissions</DialogTitle>
          <DialogDescription>
            Generated automatically when the module was created. Assign them to roles from
            the Roles screen.
          </DialogDescription>
        </DialogHeader>

        {moduleRow && moduleRow.permissions.length > 0 ? (
          <ul className="max-h-80 space-y-2 overflow-y-auto">
            {[...moduleRow.permissions]
              .sort((a, b) => a.code.localeCompare(b.code))
              .map((permission) => (
                <li
                  key={permission.id}
                  className="flex items-center justify-between gap-3 rounded-md border px-3 py-2"
                >
                  <span className="text-sm font-medium">{permission.name}</span>
                  <Badge variant="secondary" className="shrink-0 font-mono text-xs">
                    {permission.code}
                  </Badge>
                </li>
              ))}
          </ul>
        ) : (
          <p className="py-4 text-center text-sm text-muted-foreground">
            This module has no permissions.
          </p>
        )}
      </DialogContent>
    </Dialog>
  )
}
