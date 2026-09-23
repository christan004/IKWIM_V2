import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { AlertCircle, BarChart3, Droplet, Fuel, Gauge, Lock, Mail } from 'lucide-react'
import { authService } from '@/features/auth/auth.service'
import { useAuthStore } from '@/stores/auth-store'
import { markSessionFresh } from '@/hooks/use-session-restore'
import { errorMessage, fieldErrors } from '@/lib/error-message'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { BrandPanelBackground } from '@/components/brand-panel-background'

const loginSchema = z.object({
  email: z.string().email('Enter a valid email'),
  password: z.string().min(1, 'Password is required'),
})

type LoginForm = z.infer<typeof loginSchema>

const features = [
  { icon: Fuel, text: 'Live stock across every station and depot' },
  { icon: Gauge, text: 'Tank status, pumps, and nozzles at a glance' },
  { icon: BarChart3, text: 'Reconciliation that flags variance early' },
]

export function LoginPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const setSession = useAuthStore((s) => s.setSession)
  const [serverError, setServerError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<LoginForm>({ resolver: zodResolver(loginSchema) })

  async function onSubmit(values: LoginForm) {
    setServerError(null)
    setIsSubmitting(true)
    try {
      const session = await authService.login(values)
      setSession(session)
      // This session came straight from /auth/login — as fresh as a boot-time
      // refresh would make it — so skip the one `useSessionRestore` would
      // otherwise fire the moment `ProtectedRoute` mounts. See its comment.
      markSessionFresh()
      const redirectTo = (location.state as { from?: string } | null)?.from ?? '/'
      navigate(redirectTo, { replace: true })
    } catch (err) {
      // A VALIDATION_ERROR carries per-field messages; show those inline rather
      // than the generic "The request contains invalid data" banner.
      const fields = fieldErrors(err)
      if (fields) {
        for (const [name, message] of Object.entries(fields)) {
          if (name === 'email' || name === 'password') setError(name, { message })
        }
      } else {
        setServerError(errorMessage(err))
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="grid min-h-svh lg:grid-cols-2">
      {/* Brand panel */}
      <div className="relative hidden overflow-hidden bg-sidebar text-sidebar-foreground lg:flex lg:flex-col lg:justify-between lg:p-12">
        <BrandPanelBackground />
        <div className="relative flex items-center gap-2.5">
          <div className="flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-lg shadow-primary/30">
            <Droplet className="size-5 fill-current" />
          </div>
          <span className="font-display text-xl font-bold tracking-tight">
            Petro<span className="text-primary">X</span>
          </span>
        </div>

        <div className="relative space-y-8">
          <div className="space-y-3">
            <h1 className="font-display text-3xl font-bold leading-tight tracking-tight">
              Run every station from one console.
            </h1>
            <p className="max-w-md text-sidebar-foreground/70">
              Fuel inventory, supply chain, and reconciliation for the whole network – in real time.
            </p>
          </div>
          <ul className="space-y-3">
            {features.map((f) => (
              <li key={f.text} className="flex items-center gap-3 text-sm text-sidebar-foreground/80">
                <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-sidebar-accent">
                  <f.icon className="size-4 text-primary" />
                </div>
                {f.text}
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-xs text-sidebar-foreground/40">PetroX Management Console</p>
      </div>

      {/* Form panel */}
      <div className="flex items-center justify-center bg-background px-6 py-12">
        <div className="w-full max-w-sm space-y-8">
          <div className="space-y-2 text-center lg:text-left">
            <div className="mb-4 flex justify-center lg:hidden">
              <div className="flex size-10 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm">
                <Droplet className="size-5 fill-current" />
              </div>
            </div>
            <h2 className="font-display text-2xl font-bold tracking-tight">Welcome back</h2>
            <p className="text-sm text-muted-foreground">Sign in to the management console</p>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="grid gap-4">
            <div className="grid gap-1.5">
              <Label htmlFor="email">Email</Label>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="email"
                  type="email"
                  autoComplete="username"
                  placeholder="you@petrox.local"
                  className="pl-9"
                  {...register('email')}
                />
              </div>
              {errors.email && <p className="text-sm text-destructive">{errors.email.message}</p>}
            </div>

            <div className="grid gap-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="password">Password</Label>
                <Link
                  to="/forgot-password"
                  className="text-xs text-muted-foreground underline-offset-4 hover:text-primary hover:underline"
                >
                  Forgot password?
                </Link>
              </div>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  placeholder="••••••••"
                  className="pl-9"
                  {...register('password')}
                />
              </div>
              {errors.password && (
                <p className="text-sm text-destructive">{errors.password.message}</p>
              )}
            </div>

            {serverError && (
              <div className="flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                <AlertCircle className="size-4 shrink-0" />
                {serverError}
              </div>
            )}

            <Button type="submit" disabled={isSubmitting} size="lg" className="mt-2">
              {isSubmitting ? 'Signing in…' : 'Sign in'}
            </Button>
          </form>
        </div>
      </div>
    </div>
  )
}
