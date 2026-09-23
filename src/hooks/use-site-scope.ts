import { useMemo } from 'react'
import { useAuthStore } from '@/stores/auth-store'
import type { Site } from '@/api/types'

/**
 * Which sites the signed-in user may act on.
 *
 * A **`superAdmin`** is not scoped to any site — their `sites` array is empty
 * precisely because they may choose from all of them. Everyone else is limited
 * to their own assignments, which the session carries in full (each entry nests
 * the whole `site` record), so no extra request is needed to name them.
 *
 * This is a **convenience, not a security boundary**: the API decides what a
 * request may do. Narrowing the picker keeps someone from choosing a site they
 * cannot use, rather than pretending to enforce anything.
 */
export function useSiteScope(allSites: Site[] = []) {
  const user = useAuthStore((s) => s.user)

  return useMemo(() => {
    const isSuperAdmin = user?.position === 'superAdmin'
    const assigned = user?.sites ?? []

    if (isSuperAdmin) {
      return {
        isSuperAdmin: true,
        /** Every site — a superAdmin is unrestricted. */
        sites: allSites,
        /** True when the user has exactly one site and no choice to make. */
        isSingleSite: false,
        /** The only site, when there is exactly one. */
        onlySiteId: undefined as string | undefined,
      }
    }

    // The assignment nests the full site, so this needs no lookup. Falling back
    // to `allSites` covers a shape change that dropped the nesting.
    const sites = assigned
      .map((entry) => entry.site ?? allSites.find((s) => s.id === entry.siteId))
      .filter((site): site is Site => Boolean(site))

    return {
      isSuperAdmin: false,
      sites,
      isSingleSite: sites.length === 1,
      onlySiteId: sites.length === 1 ? sites[0].id : undefined,
    }
  }, [user, allSites])
}
