import axios, { type AxiosRequestConfig } from 'axios'
import { useAuthStore } from '@/stores/auth-store'
import type { ApiEnvelope, AuthSession } from '@/api/types'

const API_BASE_URL = import.meta.env.VITE_API_URL ?? '/api/v1'

/**
 * Authentication is **cookie-based**. The API sets `access_token` and
 * `refresh_token` as `HttpOnly; SameSite=Lax` cookies on login, and reads them
 * back on every request — no `Authorization` header is sent or needed.
 *
 * Three consequences follow, and they are why this file has no token handling:
 *
 * - **`withCredentials` is mandatory.** Axios omits cookies by default; without
 *   it every request is anonymous.
 * - **The tokens are unreadable from JavaScript** (`HttpOnly`), which is the
 *   point — they cannot be exfiltrated by injected script. Nothing is stored.
 * - **`SameSite=Lax` requires the browser to be same-origin with the API**, so
 *   the dev proxy in `vite.config.ts` is a functional requirement rather than a
 *   CORS convenience. See the README.
 */
export const axiosInstance = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
})

/**
 * Redeems the refresh cookie for a fresh pair.
 *
 * The cookie travels automatically and the response sets the new pair, so
 * nothing is passed in or read out — the boolean only reports whether the
 * session survived. Not exported: always go through `refreshSession` below,
 * which is the only thing that guards this against running twice at once.
 */
async function performRefresh(): Promise<boolean> {
  try {
    const { data } = await axios.post<ApiEnvelope<AuthSession>>(
      `${API_BASE_URL}/auth/refresh`,
      // No body: the refresh token is in the cookie.
      undefined,
      { withCredentials: true },
    )
    // Refresh returns the user and permissions too, which is what lets a
    // session be restored after a reload without an /auth/me endpoint.
    useAuthStore.getState().setSession(data.data)
    return true
  } catch {
    useAuthStore.getState().clearSession()
    return false
  }
}

let refreshPromise: Promise<boolean> | null = null

/**
 * The **one** way to redeem the refresh cookie, called by both this file's own
 * 401 interceptor and `useSessionRestore`'s boot-time check.
 *
 * They used to each hold a separate single-flight promise around their own
 * copy of this call — this file's `refreshPromise`, and a near-identical
 * `restorePromise` in `use-session-restore.ts`. Each one correctly stopped
 * *itself* from firing twice, but neither knew about the other: on page load,
 * a request that raced ahead of the boot-time refresh (the sidebar's own fetch
 * landing before the new access token was in) could 401 on the stale token,
 * trip this file's interceptor, and start a **second**, independent
 * `/auth/refresh` call at the same moment the boot refresh was already in
 * flight — two redemptions of the same rotating refresh token, from two
 * unrelated promises neither aware the other existed. A caller unlucky enough
 * to be the one that lost that race saw its own refresh fail and hard-redirected
 * to `/login`, even though the other call had (or was about to) succeed —
 * indistinguishable, from that caller's side, from a session that had
 * genuinely expired.
 *
 * Funneling every refresh through this single function, and therefore through
 * this single `refreshPromise`, removes the second promise entirely: there is
 * only ever one `/auth/refresh` call in flight, whichever trigger asked for it.
 */
export function refreshSession(): Promise<boolean> {
  refreshPromise ??= performRefresh().finally(() => {
    refreshPromise = null
  })
  return refreshPromise
}

// Public, unauthenticated endpoints whose own 401s are expected user-facing
// errors (wrong password, bad/expired reset token) — not a sign of a stale
// session, so they must never trigger the refresh-and-retry-or-redirect flow.
const PUBLIC_AUTH_PATHS = ['/auth/login', '/auth/refresh', '/auth/password-reset']

axiosInstance.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config
    const isPublicAuthRequest = PUBLIC_AUTH_PATHS.some((path) =>
      originalRequest?.url?.includes(path),
    )

    if (error.response?.status === 401 && !originalRequest._retry && !isPublicAuthRequest) {
      originalRequest._retry = true

      // Concurrent 401s — and a concurrent boot-time restore, see
      // `refreshSession` — all await the very same in-flight call. With a
      // rotating refresh token this is a correctness requirement, not an
      // optimization: two separate redemptions would be two separate promises
      // with no way to notice each other.
      const refreshed = await refreshSession()
      if (refreshed) {
        // The retry carries the new cookie automatically — there is no header
        // to rewrite.
        return axiosInstance(originalRequest)
      }

      useAuthStore.getState().clearSession()
      window.location.assign('/login')
    }

    return Promise.reject(error)
  },
)

/**
 * Every endpoint wraps its payload in `{ success, data }`. Services call this
 * and get the inner `data` back directly, so screens never see the envelope.
 */
export const apiClient = async <T>(config: AxiosRequestConfig): Promise<T> => {
  const response = await axiosInstance<ApiEnvelope<T>>(config)
  return response.data.data
}

export default apiClient
