import { Component, type ErrorInfo, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'

interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
}

/**
 * Catches a render error so a crash shows what happened instead of a blank page.
 *
 * Without one, React unmounts the whole tree on a thrown render and the document
 * is left empty — no sidebar, no message, nothing to act on. That is the single
 * least debuggable failure a user can hit, and it is indistinguishable from a
 * permissions problem or an empty list.
 *
 * A class component because `componentDidCatch` has no hook equivalent.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Kept so the stack reaches the console even in a production build, where
    // React's own overlay is absent.
    console.error('Render error:', error, info.componentStack)
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children

    return (
      <div className="flex min-h-svh items-center justify-center p-6">
        <div className="w-full max-w-lg space-y-4 rounded-lg border border-destructive/30 bg-destructive/5 p-6">
          <div>
            <h1 className="font-display text-lg font-bold tracking-tight">
              Something broke on this page
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              The error is below, and the full stack is in the browser console.
            </p>
          </div>

          <pre className="max-h-64 overflow-auto rounded-md border bg-background p-3 text-xs">
            {error.message}
            {error.stack ? `\n\n${error.stack}` : ''}
          </pre>

          <div className="flex gap-2">
            <Button onClick={() => this.setState({ error: null })}>Try again</Button>
            <Button variant="outline" onClick={() => window.location.reload()}>
              Reload
            </Button>
          </div>
        </div>
      </div>
    )
  }
}
