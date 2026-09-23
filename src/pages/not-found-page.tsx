import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'

export function NotFoundPage() {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-3 bg-background px-6 text-center">
      <p className="font-display text-5xl font-bold text-primary">404</p>
      <h1 className="font-display text-xl font-semibold tracking-tight">
        We couldn&rsquo;t find that page.
      </h1>
      <Button asChild variant="outline" className="mt-2">
        <Link to="/">Back to dashboard</Link>
      </Button>
    </div>
  )
}
