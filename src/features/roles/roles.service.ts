import { apiClient } from '@/api/axios-instance'
import type {
  AssignRolePermissionsRequest,
  CreateRoleRequest,
  Paginated,
  RoleEntity,
} from '@/api/types'

export const rolesService = {
  /** Paginated. Each role carries its permissions through a join table. */
  list: (params?: { page?: number; pageSize?: number }) =>
    apiClient<Paginated<RoleEntity>>({ url: '/roles', method: 'GET', params }),

  /**
   * Creates a role. `permissionIds` is optional — omitting it creates a role
   * with no permissions. An unknown permission id returns 409 RELATION_CONFLICT.
   */
  create: (role: CreateRoleRequest) =>
    apiClient<RoleEntity>({ url: '/roles', method: 'POST', data: role }),

  /**
   * Grants permissions to a role and sets its name.
   *
   * Must be **PUT** with the role id in the path — POST and PATCH on the same
   * path both return 404.
   *
   * ⚠️ **Additive only.** Verified against the live API: sending a subset does
   * not remove the permissions left out, and sending `[]` removes nothing.
   * There is no endpoint to revoke a permission from a role, so the UI only
   * offers granting (see role-form-dialog.tsx).
   *
   * ⚠️ `name` is written verbatim, so sending `""` blanks the role's name. The
   * caller always sends the intended name, never an empty string.
   */
  assignPermissions: (roleId: string, body: AssignRolePermissionsRequest) =>
    apiClient<RoleEntity>({
      url: `/roles/assign-permissions/${roleId}`,
      method: 'PUT',
      data: body,
    }),

  /**
   * Deletes a role. Fixed roles (e.g. Administrator) are rejected by the API
   * with 409 RELATION_CONFLICT, so the UI hides the action for them.
   */
  remove: (id: string) => apiClient<null>({ url: `/roles/${id}`, method: 'DELETE' }),
}
