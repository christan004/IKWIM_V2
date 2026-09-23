import { apiClient } from '@/api/axios-instance'
import type {
  CreateModuleRequest,
  ModuleListNode,
  ModuleRecord,
  ModuleSortingEntry,
  SidebarModule,
  UpdateModuleRequest,
} from '@/api/types'

export const modulesService = {
  /**
   * The navigation tree for the signed-in user — a filtered subset of the full
   * module list, without permissions. Used to build the sidebar.
   */
  sidebar: () => apiClient<SidebarModule[]>({ url: '/modules/sidebar', method: 'GET' }),

  /**
   * Every module with its generated permissions. This is the administration
   * view: it includes modules the sidebar omits.
   *
   * The response nests children **and** repeats them at the top level, so
   * callers must keep only genuine roots (`parentId === null`) — see
   * `use-modules.ts`.
   */
  list: () => apiClient<ModuleListNode[]>({ url: '/modules/list', method: 'GET' }),

  /**
   * Creates one or more modules.
   *
   * The endpoint takes an **array** even for a single module, and returns the
   * created records. `code` is generated from `name` by the backend; sending it
   * has no effect. Sending `sorting` is likewise ignored (the API stores 0).
   */
  create: (modules: CreateModuleRequest[]) =>
    apiClient<ModuleRecord[]>({ url: '/modules/create', method: 'POST', data: modules }),

  /**
   * Renames a module, and optionally sets its icon.
   *
   * ⚠️ **`PUT /modules/edit/:id`** — the id is in the **path**. The other
   * spellings (`/modules/:id`, `/modules/update/:id`, a bodyless
   * `/modules/edit`) all return `ROUTE_NOT_FOUND`.
   *
   * Only `name` is required; `code` cannot be changed — see
   * `UpdateModuleRequest`.
   */
  update: (id: string, body: UpdateModuleRequest) =>
    apiClient<ModuleRecord>({ url: `/modules/edit/${id}`, method: 'PUT', data: body }),

  /**
   * Deletes a module. Returns `{ count }`.
   *
   * Deleting a parent does **not** cascade — its children are promoted to
   * top-level modules with `parentId` cleared, so nothing is orphaned.
   *
   * `Content-Type` is stripped deliberately: the request has no body, and
   * Fastify rejects an empty body with 400 FST_ERR_CTP_EMPTY_JSON_BODY when the
   * header claims JSON. Axios sets that header by default, so it must be
   * removed here.
   */
  remove: (id: string) =>
    apiClient<{ count: number }>({
      url: `/modules/delete/${id}`,
      method: 'DELETE',
      headers: { 'Content-Type': null },
    }),

  /**
   * Reorders modules. Takes an **array**, so a whole level is sent in one call
   * and its numbers stay contiguous.
   *
   * `PUT` only — `POST` and `PATCH` are not routed. Ordering is per level, and
   * `sortingNumber` must be **greater than zero**.
   */
  changeSorting: (entries: ModuleSortingEntry[]) =>
    apiClient<unknown>({
      url: '/modules/change-module/sorting',
      method: 'PUT',
      data: entries,
    }),
}
