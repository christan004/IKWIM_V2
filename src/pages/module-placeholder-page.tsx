import { Construction } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

/**
 * Stands in for a module whose screen has not been built yet, so every route in
 * the sidebar resolves to something explanatory instead of the 404 page.
 * Replace the route's element with the real page as each is built.
 */
export function ModulePlaceholderPage({ title }: { title: string }) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight">{title}</h1>
        <p className="text-sm text-muted-foreground">This module is not built yet.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Construction className="size-4 text-warning" />
            Coming soon
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          <p>
            The <span className="font-medium text-foreground">{title}</span> screen has not been
            implemented. Its route is registered so the sidebar link resolves — swap this
            placeholder for the real page in <code className="rounded bg-muted px-1.5 py-0.5 text-xs">App.tsx</code>{' '}
            once it exists.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
