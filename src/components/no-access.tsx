import { ShieldAlert, ShieldOff } from 'lucide-react'

/**
 * Shown in place of a page's content when the user cannot see it. The page
 * keeps its heading, so the user knows where they are rather than facing a
 * blank screen.
 *
 * Two distinct cases:
 *
 * - `variant="denied"` — the role genuinely lacks the `read` permission, so no
 *   request was made.
 * - `variant="rejected"` — the role *holds* `read`, but the API returned 403
 *   anyway. That is a server-side gating mismatch, not a missing grant, and it
 *   is worth saying so rather than blaming the user's permissions.
 */
export function NoAccess({
  resource,
  variant = 'denied',
  permission,
}: {
  resource: string
  variant?: 'denied' | 'rejected'
  /** The read permission this page checks, e.g. `suppliers.read`. */
  permission?: string
}) {
  const rejected = variant === 'rejected'

  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-md border border-dashed py-16 text-center">
      <div
        className={
          rejected
            ? 'flex size-11 items-center justify-center rounded-full bg-destructive/10 text-destructive'
            : 'flex size-11 items-center justify-center rounded-full bg-muted text-muted-foreground'
        }
      >
        {rejected ? <ShieldAlert className="size-5" /> : <ShieldOff className="size-5" />}
      </div>

      <div className="max-w-md px-6">
        <p className="font-medium">
          {rejected
            ? `The server refused access to ${resource}`
            : `You don't have access to ${resource}`}
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          {rejected ? (
            <>
              Your role grants{' '}
              {permission ? <code className="font-mono text-xs">{permission}</code> : 'read access'}
              , but the API rejected the request. This endpoint is gated on a different
              permission — it needs fixing on the backend.
            </>
          ) : (
            'Ask an administrator to grant your role permission to view this.'
          )}
        </p>
      </div>
    </div>
  )
}
