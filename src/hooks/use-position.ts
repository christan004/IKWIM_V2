import { useAuthStore } from '@/stores/auth-store'

/**
 * The signed-in user's position, and the checks built on it.
 *
 * Distinct from permissions: a permission says what a role may *do*, while a
 * position says which part of the business someone sits in. The API enforces
 * some rules on position alone — receiving fuel into a cuve is site-manager
 * only, whatever permissions the role carries.
 *
 * ⚠️ Read from the persisted auth store, which is a **cache of the session, not
 * the session itself**. Use it to decide what to *offer*, never as a security
 * boundary — the server re-checks, and the UI surfaces its refusal.
 */
export function usePosition() {
  const position = useAuthStore((s) => s.user?.position ?? null)

  return {
    position,
    /**
     * Runs a forecourt site. Receives deliveries into cuves; does **not** move
     * stockout orders through their statuses — that is a head-office decision.
     */
    isSiteManager: position === 'siteManager',
    /** Unrestricted, and not scoped to any site. */
    isSuperAdmin: position === 'superAdmin',
  }
}
