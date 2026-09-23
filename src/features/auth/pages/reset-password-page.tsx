import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { AlertCircle, ArrowLeft, CheckCircle2, Droplet, KeyRound, Lock } from 'lucide-react'
import { authService } from '@/features/auth/auth.service'
import { errorCode, errorMessage, fieldErrors } from '@/lib/error-message'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { BrandPanelBackground } from '@/components/brand-panel-background'

// The API enforces a minimum of 8 characters and rejects anything shorter with
// a per-field VALIDATION_ERROR. Mirroring that here catches it before a
// round-trip; any stricter server-side policy still surfaces as a field error.
const schema = z
  .object({
    password: z.string().min(8, 'Must be at least 8 characters'),
    confirmPassword: z.string().min(1, 'Confirm your new password'),
  })
  .refine((values) => values.password === values.confirmPassword, {
    path: ['confirmPassword'],
    message: 'Passwords do not match',
  })

type ResetPasswordForm = z.infer<typeof schema>

export function ResetPasswordPage() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const token = searchParams.get('token') ?? ''

  const [serverError, setServerError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isDone, setIsDone] = useState(false)
  /** Set when the API rejects the token itself — the form is then a dead end. */
  const [tokenRejected, setTokenRejected] = useState(false)

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<ResetPasswordForm>({ resolver: zodResolver(schema) })

  async function onSubmit(values: ResetPasswordForm) {
    setServerError(null)
    setIsSubmitting(true)
    try {
      await authService.confirmPasswordReset(token, values.password)
      setIsDone(true)
    } catch (err) {
      const fields = fieldErrors(err)

      // A too-short/malformed token comes back as a `token` field error, and a
      // well-formed but wrong or expired one as 401 UNAUTHORIZED. Neither is
      // fixable by editing the form, so both switch to the dead-end state.
      if (errorCode(err) === 'UNAUTHORIZED' || fields?.token) {
        setTokenRejected(true)
        return
      }

      if (fields?.password) {
        setError('password', { message: fields.password })
      } else {
        setServerError(errorMessage(err))
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  // No token in the URL at all — same dead end as a rejected one.
  const isUnusable = tokenRejected || !token

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

        <div className="relative space-y-3">
          <h1 className="font-display text-3xl font-bold leading-tight tracking-tight">
            Choose a new password.
          </h1>
          <p className="max-w-md text-sidebar-foreground/70">
            Pick something you don&rsquo;t use anywhere else. You&rsquo;ll use it to sign in from
            now on.
          </p>
        </div>

        <p className="relative text-xs text-sidebar-foreground/40">PetroX Management Console</p>
      </div>

      {/* Form panel */}
      <div className="flex items-center justify-center bg-background px-6 py-12">
        <div className="w-full max-w-sm space-y-8">
          {isDone ? (
            <>
              <div className="space-y-3 text-center lg:text-left">
                <div className="flex justify-center lg:justify-start">
                  <div className="flex size-11 items-center justify-center rounded-full bg-success/10 text-success">
                    <CheckCircle2 className="size-5" />
                  </div>
                </div>
                <h2 className="font-display text-2xl font-bold tracking-tight">
                  Password updated
                </h2>
                <p className="text-sm text-muted-foreground">
                  Your password has been changed. Sign in with your new password to continue.
                </p>
              </div>

              <Button size="lg" className="w-full" onClick={() => navigate('/login')}>
                Continue to sign in
              </Button>
            </>
          ) : isUnusable ? (
            <>
              <div className="space-y-3 text-center lg:text-left">
                <div className="flex justify-center lg:justify-start">
                  <div className="flex size-11 items-center justify-center rounded-full bg-destructive/10 text-destructive">
                    <KeyRound className="size-5" />
                  </div>
                </div>
                <h2 className="font-display text-2xl font-bold tracking-tight">
                  This link is no longer valid
                </h2>
                <p className="text-sm text-muted-foreground">
                  Reset links expire quickly and can only be used once. Request a new one and
                  we&rsquo;ll email you a fresh link.
                </p>
              </div>

              <div className="grid gap-2">
                <Button asChild size="lg">
                  <Link to="/forgot-password">Request a new link</Link>
                </Button>
                <Button asChild variant="ghost" size="lg">
                  <Link to="/login">
                    <ArrowLeft className="size-4" />
                    Back to sign in
                  </Link>
                </Button>
              </div>
            </>
          ) : (
            <>
              <div className="space-y-2 text-center lg:text-left">
                <h2 className="font-display text-2xl font-bold tracking-tight">
                  Set a new password
                </h2>
                <p className="text-sm text-muted-foreground">
                  Choose a password of at least 8 characters.
                </p>
              </div>

              <form onSubmit={handleSubmit(onSubmit)} className="grid gap-4">
                <div className="grid gap-1.5">
                  <Label htmlFor="password">New password</Label>
                  <div className="relative">
                    <Lock className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      id="password"
                      type="password"
                      autoComplete="new-password"
                      placeholder="••••••••"
                      className="pl-9"
                      {...register('password')}
                    />
                  </div>
                  {errors.password && (
                    <p className="text-sm text-destructive">{errors.password.message}</p>
                  )}
                </div>

                <div className="grid gap-1.5">
                  <Label htmlFor="confirmPassword">Confirm new password</Label>
                  <div className="relative">
                    <Lock className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      id="confirmPassword"
                      type="password"
                      autoComplete="new-password"
                      placeholder="••••••••"
                      className="pl-9"
                      {...register('confirmPassword')}
                    />
                  </div>
                  {errors.confirmPassword && (
                    <p className="text-sm text-destructive">{errors.confirmPassword.message}</p>
                  )}
                </div>

                {serverError && (
                  <div className="flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                    <AlertCircle className="size-4 shrink-0" />
                    {serverError}
                  </div>
                )}

                <Button type="submit" disabled={isSubmitting} size="lg" className="mt-2">
                  {isSubmitting ? 'Updating…' : 'Update password'}
                </Button>
              </form>

              <p className="text-center text-sm text-muted-foreground">
                <Link to="/login" className="underline-offset-4 hover:text-primary hover:underline">
                  Back to sign in
                </Link>
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
