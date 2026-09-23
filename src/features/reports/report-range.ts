/**
 * Date helpers for the report pages.
 *
 * Their own module because a component file that also exports functions trips
 * the fast-refresh lint rule, and both report pages need these.
 */

/** `2026-08-26` — a date input's value for an instant. */
export function toDateInput(date: Date): string {
  return date.toISOString().slice(0, 10)
}

/**
 * The range a report opens on: the last twelve months through today.
 *
 * A convenience rather than a workaround — unlike stock and nominations, these
 * endpoints return everything when unfiltered. A report is nearly always read
 * for a period, so it opens on one.
 */
export function defaultReportRange() {
  const to = new Date()
  const from = new Date(to)
  from.setFullYear(from.getFullYear() - 1)
  return { from: toDateInput(from), to: toDateInput(to) }
}
