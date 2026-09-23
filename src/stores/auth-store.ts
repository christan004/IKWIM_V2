import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type { AuthSession, AuthUser } from '@/api/types'

interface AuthState {
  user: AuthUser | null
  permissions: string[]
  setSession: (session: AuthSession) => void
  clearSession: () => void
  /** True when the signed-in user holds every permission listed. */
  can: (...required: string[]) => boolean
}

/**
 * **No tokens are stored here.** Authentication moved to `HttpOnly` cookies, so
 * the access and refresh tokens are neither readable nor writable from
 * JavaScript — which is the security benefit. The browser holds them; this
 * store holds only who is signed in and what they may do.
 *
 * `user` and `permissions` are still persisted, so a reload renders the shell
 * and the correct navigation immediately rather than flashing a signed-out
 * state while the first request settles.
 *
 * ⚠️ **That persisted copy is a cache, not the session.** The cookies are the
 * only real credential, and they can expire or be cleared independently of
 * `localStorage`. If they have, the first request 401s, the refresh fails, and
 * the interceptor clears this and redirects — so a stale copy resolves itself
 * on first use rather than granting anything.
 */
export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      permissions: [],

      setSession: (session) =>
        set({
          user: session.user,
          permissions: session.permissions ?? [],
        }),

      clearSession: () => set({ user: null, permissions: [] }),

      can: (...required) => {
        const held = get().permissions
        return required.every((p) => held.includes(p))
      },
    }),
    {
      name: 'petrox-auth',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        user: state.user,
        permissions: state.permissions,
      }),
    },
  ),
)
