import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Link } from 'react-router-dom'
import { AlertCircle, ArrowLeft, Droplet, FlaskConical, MailCheck, Mail } from 'lucide-react'
import { authService } from '@/features/auth/auth.service'
import { errorCode, errorMessage, fieldErrors } from '@/lib/error-message'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { BrandPanelBackground } from '@/components/brand-panel-background'

const schema = z.object({
  email: z.string().email('Enter a valid email'),
})

type ForgotPasswordForm = z.infer<typeof schema>

export function ForgotPasswordPage() {
  const [serverError, setServerError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [sentTo, setSentTo] = useState<string | null>(null)
  /**
   * Dev-only shortcut. The API echoes the reset token in its response (a
   * security issue tracked in the README), which makes it possible to test the
   * flow without waiting on email delivery. Gated on `import.meta.env.DEV` so
   * it is stripped from production builds — never render this to real users.
   */
  const [devToken, setDevToken] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<ForgotPasswordForm>({ resolver: zodResolver(schema) })

  async function onSubmit(values: ForgotPasswordForm) {
    setServerError(null)
    setIsSubmitting(true)
    try {
      const result = await authService.requestPasswordReset(values.email)
      setSentTo(values.email)
      if (import.meta.env.DEV && result?.token) setDevToken(result.token)
    } catch (err) {
      // The API answers 404 USER_NOT_FOUND for an unknown address. This is an
      // internal console — accounts are created by an administrator, never
      // self-registered — so telling the user their address has no account is
      // worth more than hiding which emails are registered. On a public-facing
      // form this branch should show the neutral confirmation instead.
      if (errorCode(err) === 'USER_NOT_FOUND') {
        setError('email', { message: 'No PetroX account uses this email address.' })
        return
      }

      const fields = fieldErrors(err)
      if (fields?.email) {
        setError('email', { message: fields.email })
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

        <div className="relative space-y-3">
          <h1 className="font-display text-3xl font-bold leading-tight tracking-tight">
            Locked out?
          </h1>
          <p className="max-w-md text-sidebar-foreground/70">
            We&rsquo;ll email you a secure link so you can set a new password and get back to the
            console.
          </p>
        </div>

        <p className="relative text-xs text-sidebar-foreground/40">PetroX Management Console</p>
      </div>

      {/* Form panel */}
      <div className="flex items-center justify-center bg-background px-6 py-12">
        <div className="w-full max-w-sm space-y-8">
          {sentTo ? (
            <>
              <div className="space-y-3 text-center lg:text-left">
                <div className="flex justify-center lg:justify-start">
                  <div className="flex size-11 items-center justify-center rounded-full bg-success/10 text-success">
                    <MailCheck className="size-5" />
                  </div>
                </div>
                <h2 className="font-display text-2xl font-bold tracking-tight">Check your email</h2>
                <p className="text-sm text-muted-foreground">
                  We sent a reset link to{' '}
                  <span className="font-medium text-foreground">{sentTo}</span>. The link expires
                  shortly, so use it soon.
                </p>
                <p className="text-sm text-muted-foreground">
                  Nothing arrived? Check your spam folder.
                </p>
              </div>

              {/* Dev-only: skip the inbox while testing. Stripped from prod builds. */}
              {import.meta.env.DEV && devToken && (
                <div className="space-y-2 rounded-md border border-warning/40 bg-warning/10 p-3">
                  <p className="flex items-center gap-2 text-xs font-medium text-warning-foreground">
                    <FlaskConical className="size-3.5" />
                    Dev only — not shown in production
                  </p>
                  <p className="break-all font-mono text-xs text-muted-foreground">{devToken}</p>
                  <Button asChild size="sm" variant="outline" className="w-full">
                    <Link to={`/reset-password?token=${encodeURIComponent(devToken)}`}>
                      Open the reset link
                    </Link>
                  </Button>
                </div>
              )}

              <Button asChild variant="outline" size="lg" className="w-full">
                <Link to="/login">
                  <ArrowLeft className="size-4" />
                  Back to sign in
                </Link>
              </Button>
            </>
          ) : (
            <>
              <div className="space-y-2 text-center lg:text-left">
                <h2 className="font-display text-2xl font-bold tracking-tight">
                  Reset your password
                </h2>
                <p className="text-sm text-muted-foreground">
                  Enter your email and we&rsquo;ll send you a link to set a new one.
                </p>
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
                  {errors.email && (
                    <p className="text-sm text-destructive">{errors.email.message}</p>
                  )}
                </div>

                {serverError && (
                  <div className="flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                    <AlertCircle className="size-4 shrink-0" />
                    {serverError}
                  </div>
                )}

                <Button type="submit" disabled={isSubmitting} size="lg" className="mt-2">
                  {isSubmitting ? 'Sending…' : 'Send reset link'}
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
