import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuthStore } from '@/stores/auth-store'
import { usePermissions, type PermissionAction } from '@/hooks/use-permissions'
import { useSessionRestore } from '@/hooks/use-session-restore'
import { FullPageSpinner } from '@/components/full-page-spinner'

export function ProtectedRoute() {
  /**
   * The auth cookies are `HttpOnly`, so a persisted user is the only signal
   * available here. It is revalidated on boot by `useSessionRestore`, which
   * clears it if the cookies have expired — so by the time this renders, the
   * presence of a user means a session that was live moments ago.
   */
  const user = useAuthStore((s) => s.user)
  const location = useLocation()
  const { isRestoring } = useSessionRestore()

  // A persisted user means a session may still be recoverable — wait for the
  // silent refresh rather than bouncing the user to /login on reload.
  if (isRestoring) {
    return <FullPageSpinner label="Restoring your session" />
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }

  return <Outlet />
}

/**
 * Route-level guard. Pages gate their own actions, so this is only for routes
 * that should not be reachable at all — `action` defaults to `read`.
 */
export function RequirePermissionRoute({
  module,
  action = 'read',
}: {
  module: string
  action?: PermissionAction
}) {
  const { can } = usePermissions()

  if (!can(module, action)) {
    return <Navigate to="/" replace />
  }

  return <Outlet />
}

/** Keeps a signed-in user off /login and the other public auth screens. */
export function PublicOnlyRoute() {
  const user = useAuthStore((s) => s.user)

  if (user) {
    return <Navigate to="/" replace />
  }

  return <Outlet />
}
