import { useEffect, useState } from 'react'
import { refreshSession } from '@/api/axios-instance'
import { useAuthStore } from '@/stores/auth-store'

/**
 * Revalidates the cookie session once per page load.
 *
 * With `HttpOnly` cookies the client cannot see whether it is signed in — the
 * cookies are invisible to JavaScript, so a persisted `user` is the only hint
 * that a session *may* still exist. That hint can be stale: the cookies expire
 * on their own schedule and can be cleared independently of `localStorage`.
 *
 * So on boot, a persisted user triggers one `/auth/refresh`. It travels with
 * whatever cookies the browser holds and settles the question:
 *
 * - **succeeds** → the session is live; the fresh user and permissions replace
 *   the persisted copy, so a role change since last login takes effect.
 * - **fails** → the cookies are gone or expired; the store is cleared and the
 *   guard redirects to /login.
 *
 * Without this, a stale `localStorage` entry would render the full shell for
 * someone with no valid session, and every request would 401 behind it.
 *
 * ⚠️ **Goes through `refreshSession` in `axios-instance.ts`** rather than
 * calling `authService.refresh()` directly, so this boot-time check and the
 * axios 401 interceptor share the same in-flight request. They used to each
 * hold their own separate promise, so a request that raced ahead of this
 * hook's refresh — 401ing on the still-stale access token — could trigger the
 * interceptor's own, independent second redemption of the same refresh token.
 * See the long comment on `refreshSession` for the full story.
 *
 * Module-scoped so the boot-time attempt is only counted once per page load no
 * matter how many components mount the hook.
 */
let hasRestored = false

/**
 * Tells this hook a session was just established directly — by `LoginPage`,
 * right after a successful `POST /auth/login` — and needs no confirming.
 *
 * ⚠️ **Call this from `LoginPage` after `setSession`.** Without it, logging in
 * sets `user`, `ProtectedRoute` mounts, and this hook's `needsRestore` sees a
 * truthy `user` with `hasRestored` still `false` on this fresh page load — so
 * it fires an **immediate, entirely redundant `/auth/refresh`** a moment after
 * login, rotating the refresh token the login response just issued for no
 * reason. That extra rotation, this close on the heels of the one from login
 * itself, is the shortest possible window in which the client's cookie and the
 * server's idea of the current token could plausibly still disagree — and
 * therefore the single easiest opportunity to avoid entirely, rather than rely
 * on the server tolerating it. A session obtained directly from `/auth/login`
 * is, by construction, already exactly as fresh as a refresh would make it.
 */
export function markSessionFresh() {
  hasRestored = true
}

export function useSessionRestore() {
  const user = useAuthStore((s) => s.user)

  // A persisted user is the only available signal — the cookies themselves
  // cannot be read.
  const needsRestore = Boolean(user) && !hasRestored
  const [isRestoring, setIsRestoring] = useState(needsRestore)

  useEffect(() => {
    if (!needsRestore) {
      setIsRestoring(false)
      return
    }

    let cancelled = false

    // `refreshSession` already de-duplicates internally — see its own comment
    // — so this hook no longer needs a promise of its own to guard against
    // running twice; it only needs to know when the shared call settles.
    refreshSession()
      .finally(() => {
        hasRestored = true
      })
      .then(() => {
        if (!cancelled) setIsRestoring(false)
      })

    return () => {
      cancelled = true
    }
  }, [needsRestore])

  return { isRestoring }
}
