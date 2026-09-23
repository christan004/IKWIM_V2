import { apiClient } from '@/api/axios-instance'
import type { ClearanceAgent, ClearanceAgentRequest } from '@/api/types'

/**
 * ⚠️ The route is **`/clearing-agents`** while the module and its permissions
 * are **`clearance.agent`**. Both spellings are live and neither is wrong.
 */
export const clearanceAgentsService = {
  /** A flat array, like supplier types — not a paginated envelope. */
  list: () => apiClient<ClearanceAgent[]>({ url: '/clearing-agents', method: 'GET' }),

  /**
   * ⚠️ **Returns `200` with `data: null` for an unknown id**, not a `404`, so a
   * missing record is indistinguishable from an empty one. Callers must treat a
   * null payload as "not found" rather than trusting the status.
   */
  get: (id: string) =>
    apiClient<ClearanceAgent | null>({ url: `/clearing-agents/${id}`, method: 'GET' }),

  create: (body: ClearanceAgentRequest) =>
    apiClient<ClearanceAgent>({ url: '/clearing-agents', method: 'POST', data: body }),

  /** Both fields are required on update too — a partial body is rejected. */
  update: (id: string, body: ClearanceAgentRequest) =>
    apiClient<ClearanceAgent>({ url: `/clearing-agents/${id}`, method: 'PUT', data: body }),

  /**
   * Toggles `active` ↔ `inactive`.
   *
   * 🔴 **This one is the opposite of every other status endpoint here.** The
   * others reject an empty body when the header claims JSON, so they strip
   * `Content-Type`; this route *requires* it, plus an explicit `{}`. Verified
   * against a fake id:
   *
   * | request | result |
   * | --- | --- |
   * | no `Content-Type`, no body | `415 FST_ERR_CTP_INVALID_MEDIA_TYPE` |
   * | `application/json`, no body | `400 FST_ERR_CTP_EMPTY_JSON_BODY` |
   * | **`application/json` + `{}`** | **`404 RESOURCE_NOT_FOUND`** ✅ |
   *
   * Only the last reaches the handler — the id was simply fake. Sending `{}`
   * does not set a status: the route still flips rather than sets.
   */
  toggleStatus: (id: string) =>
    apiClient<ClearanceAgent>({
      url: `/clearing-agents/status/${id}`,
      method: 'PUT',
      data: {},
    }),

  /** Hard delete — confirmed working against a real record. */
  remove: (id: string) =>
    apiClient<unknown>({ url: `/clearing-agents/${id}`, method: 'DELETE' }),
}
