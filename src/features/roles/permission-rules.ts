import type { ModulePermission } from '@/api/types'

/**
 * Selection helpers for the role permission picker.
 *
 * `<module>.manage` reads as "everything on this module", but **the backend
 * matches permission codes exactly** — holding `roles.manage` does not satisfy
 * a `roles.read` check. An earlier version collapsed a full selection down to
 * just `.manage`; that silently stripped the Administrator role of `roles.read`
 * and `users.read` and locked the account out of those screens.
 *
 * So selecting everything sends **every** permission id, `.manage` included.
 * If the backend is ever changed to expand `.manage`, collapsing can be
 * reintroduced here — it is deliberately the only place that decides this.
 */

export function isManage(code: string): boolean {
  return code.endsWith('.manage')
}

/** Toggles a single permission. No cross-permission side effects. */
export function togglePermission(
  selected: Set<string>,
  permissionId: string,
): Set<string> {
  const next = new Set(selected)
  if (next.has(permissionId)) next.delete(permissionId)
  else next.add(permissionId)
  return next
}

/** Selects or clears every permission on one module. */
export function toggleModule(
  selected: Set<string>,
  modulePermissions: ModulePermission[],
  select: boolean,
): Set<string> {
  const next = new Set(selected)
  for (const permission of modulePermissions) {
    if (select) next.add(permission.id)
    else next.delete(permission.id)
  }
  return next
}

/** True when every one of the module's permissions is selected. */
export function isModuleFullySelected(
  selected: Set<string>,
  modulePermissions: ModulePermission[],
): boolean {
  if (modulePermissions.length === 0) return false
  return modulePermissions.every((permission) => selected.has(permission.id))
}

/** How many of a module's permissions are selected, for the group summary. */
export function countSelected(
  selected: Set<string>,
  modulePermissions: ModulePermission[],
): number {
  return modulePermissions.filter((permission) => selected.has(permission.id)).length
}
