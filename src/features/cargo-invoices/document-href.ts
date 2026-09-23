/**
 * Resolves a stored document path to something a browser can open.
 *
 * The API returns a relative path (`/uploads/invoice.pdf`), so it is only
 * openable once the API origin is prefixed. Anything already absolute is left
 * alone, and anything that is neither is treated as no document at all rather
 * than rendered as a broken link.
 *
 * Its own module because both the invoice list and the form dialog need it, and
 * a component file that also exports helpers trips the fast-refresh lint rule.
 */
export function documentHref(path: string | null | undefined): string | null {
  if (!path) return null
  if (path.startsWith('http://') || path.startsWith('https://')) return path
  if (!path.startsWith('/uploads/')) return null
  return `https://petrox.quicko.rw${path}`
}
