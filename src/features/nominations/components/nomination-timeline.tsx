import { Check, CircleDashed, Loader2 } from 'lucide-react'
import { NOMINATION_STAGES } from '@/api/types'
import { errorMessage } from '@/lib/error-message'
import { useNominationTimeline } from '@/features/nominations/use-nominations'

/** `2026-08-22T11:32:29.967Z` → `22 Aug 2026, 11:32`. */
function formatMoment(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return date.toLocaleString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/**
 * Where a nomination has got to.
 *
 * The API returns only the stages **reached**, but the ladder is fixed at five,
 * so the remaining ones are drawn as upcoming rather than omitted — otherwise a
 * nomination at level 1 would look finished rather than just started.
 */
export function NominationTimeline({ nominationId }: { nominationId: string }) {
  const { entries, isLoading, isError, error } = useNominationTimeline(nominationId)

  if (isLoading) {
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-3.5 animate-spin" />
        Loading timeline…
      </p>
    )
  }

  if (isError) {
    return <p className="text-sm text-destructive">{errorMessage(error)}</p>
  }

  // Keyed by `level`, never by `id` — the ids repeat across nominations.
  const reached = new Map(entries.map((entry) => [entry.level, entry]))
  const currentLevel = entries.reduce((highest, e) => Math.max(highest, e.level), 0)

  return (
    <div className="space-y-3">
      <div className="flex items-baseline justify-between gap-2">
        <h4 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Timeline
        </h4>
        <span className="text-xs text-muted-foreground">
          {/* An empty response means "not started", not "missing" — the API
              returns `[]` rather than a 404 for an unknown id. */}
          {currentLevel === 0
            ? 'Not started'
            : `Stage ${currentLevel} of ${NOMINATION_STAGES.length}`}
        </span>
      </div>

      <ol className="space-y-0">
        {NOMINATION_STAGES.map((stage, index) => {
          const entry = reached.get(stage.level)
          const isDone = Boolean(entry)
          const isCurrent = stage.level === currentLevel
          const isLast = index === NOMINATION_STAGES.length - 1

          return (
            <li key={stage.level} className="flex gap-3">
              {/* Marker and its connecting rail. The rail is drawn on every
                  row but the last, so the stages read as one sequence. */}
              <div className="flex flex-col items-center">
                <span
                  className={
                    isDone
                      ? `flex size-5 shrink-0 items-center justify-center rounded-full ${
                          isCurrent ? 'bg-primary' : 'bg-primary/70'
                        } text-primary-foreground`
                      : 'flex size-5 shrink-0 items-center justify-center rounded-full border border-dashed text-muted-foreground'
                  }
                >
                  {isDone ? (
                    <Check className="size-3" strokeWidth={3} />
                  ) : (
                    <CircleDashed className="size-3" />
                  )}
                </span>
                {!isLast && (
                  <span
                    className={`w-px flex-1 ${isDone ? 'bg-primary/40' : 'bg-border'}`}
                    // Keeps the rail reaching the next marker even when a stage
                    // carries several description lines.
                    style={{ minHeight: '0.75rem' }}
                  />
                )}
              </div>

              <div className={isLast ? 'pb-0' : 'pb-3'}>
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <span
                    className={`text-sm ${
                      isDone ? 'font-medium' : 'text-muted-foreground'
                    }`}
                  >
                    {stage.label}
                  </span>
                  {entry && (
                    <span className="text-xs text-muted-foreground">
                      {formatMoment(entry.createdAt)}
                    </span>
                  )}
                </div>

                {entry ? (
                  <>
                    {/* Several notes can share one stage — level 4 returns
                        four — so they are listed rather than joined. */}
                    <ul className="mt-0.5 space-y-0.5">
                      {entry.descriptions.map((description) => (
                        <li key={description} className="text-xs text-muted-foreground">
                          {description}
                        </li>
                      ))}
                    </ul>
                    {/* Null where the system advanced the stage itself. */}
                    {entry.createdBy && (
                      <p className="mt-0.5 text-xs text-muted-foreground/80">
                        by {entry.createdBy}
                      </p>
                    )}
                  </>
                ) : (
                  <p className="mt-0.5 text-xs text-muted-foreground/70">Pending</p>
                )}
              </div>
            </li>
          )
        })}
      </ol>
    </div>
  )
}
