import { apiClient } from '@/api/axios-instance'
import type {
  AssignSiteRequest,
  CreateUserRequest,
  Paginated,
  UpdateUserRequest,
  User,
} from '@/api/types'

export const usersService = {
  /** Paginated, same envelope as /roles. */
  list: (params?: { page?: number; pageSize?: number }) =>
    apiClient<Paginated<User>>({ url: '/users', method: 'GET', params }),

  create: (user: CreateUserRequest) =>
    apiClient<User>({ url: '/users', method: 'POST', data: user }),

  /**
   * Partial update. **At least one recognised field must be present** — an
   * empty body returns `_root: At least one field is required`.
   *
   * ⚠️ `siteId` alone does not count as one here; use `assignSite` for that.
   */
  update: (id: string, body: UpdateUserRequest) =>
    apiClient<User>({ url: `/users/${id}`, method: 'PUT', data: body }),

  /**
   * Assigns a user to a site.
   *
   * ⚠️ **`PATCH`**, not `PUT` — `PUT` and `POST` on this path both return
   * `ROUTE_NOT_FOUND`, the opposite of `/users/:id`.
   *
   * `siteId` is required: `{}`, `""` and `null` are all rejected, so this
   * cannot be used to *un*assign.
   */
  assignSite: (id: string, body: AssignSiteRequest) =>
    apiClient<User>({ url: `/users/${id}/site`, method: 'PATCH', data: body }),

  /**
   * Toggles a user's active state. There is no way to request a specific
   * state — each call flips `isActive`, so the caller must not retry blindly.
   *
   * `Content-Type` is stripped deliberately: the request has no body, and
   * Fastify rejects an empty body with 400 FST_ERR_CTP_EMPTY_JSON_BODY when the
   * header claims JSON. Axios sets that header by default.
   */
  toggleStatus: (id: string) =>
    apiClient<Pick<User, 'id' | 'firstName' | 'lastName' | 'email' | 'isActive'>>({
      url: `/users/status/${id}`,
      method: 'PUT',
      headers: { 'Content-Type': null },
    }),
}
