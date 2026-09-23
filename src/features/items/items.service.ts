import { apiClient } from '@/api/axios-instance'
import type { ItemDetail, ItemNode, ItemRequest } from '@/api/types'

export const itemsService = {
  /**
   * A **nested tree**, not a paginated envelope — children arrive under each
   * node's `items` array. Inactive items are included, so status filtering is
   * the client's job.
   */
  list: () => apiClient<ItemNode[]>({ url: '/items', method: 'GET' }),

  /** Flat record with `parentId` and `status`, which the tree omits. */
  get: (id: string) => apiClient<ItemDetail>({ url: `/items/${id}`, method: 'GET' }),

  create: (item: ItemRequest) =>
    apiClient<ItemDetail>({ url: '/items', method: 'POST', data: item }),

  /**
   * `PATCH` and `DELETE` on this path both 404.
   *
   * ⚠️ Returns `data: []` — an empty array, **not the updated item** — even
   * though the change persists. Callers must refetch rather than read the
   * response, which is why the mutation invalidates the list.
   */
  update: (id: string, item: ItemRequest) =>
    apiClient<unknown>({ url: `/items/${id}`, method: 'PUT', data: item }),

  /**
   * Toggles `active` ↔ `inactive`. Flips rather than sets, like the user and
   * unit status endpoints, and takes no body — so `Content-Type` must be
   * stripped or Fastify returns 400 FST_ERR_CTP_EMPTY_JSON_BODY.
   */
  toggleStatus: (id: string) =>
    apiClient<ItemDetail>({
      url: `/items/status/${id}`,
      method: 'PUT',
      headers: { 'Content-Type': null },
    }),
}
