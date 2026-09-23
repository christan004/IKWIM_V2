import { Droplet } from 'lucide-react'

export function FullPageSpinner({ label = 'Loading' }: { label?: string }) {
  return (
    <div
      className="flex min-h-svh flex-col items-center justify-center gap-4 bg-background"
      role="status"
      aria-live="polite"
    >
      <div className="flex size-11 animate-pulse items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-lg shadow-primary/30">
        <Droplet className="size-6 fill-current" />
      </div>
      <p className="text-sm text-muted-foreground">{label}…</p>
    </div>
  )
}
