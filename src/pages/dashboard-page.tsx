import { Construction } from 'lucide-react'
import { useAuthStore } from '@/stores/auth-store'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export function DashboardPage() {
  const user = useAuthStore((s) => s.user)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight">
          Welcome back, {user?.firstName ?? 'there'}
        </h1>
        <p className="text-sm text-muted-foreground">
          Here is how the network is running right now.
        </p>
      </div>

      {/*
        The dashboard endpoints (/dashboard/stats, /dashboard/stations,
        /dashboard/activity) are not implemented on the backend yet — they all
        return ROUTE_NOT_FOUND. Rather than ship widgets that only render an
        error state, this stands in until those routes exist.
      */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Construction className="size-4 text-warning" />
            Dashboard data not available yet
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          <p>
            The reporting endpoints this page needs have not been built on the API yet. Once
            <code className="mx-1 rounded bg-muted px-1.5 py-0.5 text-xs">/dashboard/stats</code>
            and friends are available, the stat tiles, tank levels, and activity feed will render
            here.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
