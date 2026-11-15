import { Check, Circle, Eye, EyeOff, ShieldCheck } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { Input } from '../../components/ui/Field'
import type { CognitoAuthService } from '../../services/auth/cognitoAuth'
import { CognitoError } from '../../services/cognito/idp'
import { cx } from '../../utils/cx'
import { isPlausibleEmail, PASSWORD_RULES, passwordMeetsPolicy } from '../../utils/passwordPolicy'

type View = 'signin' | 'register' | 'verify' | 'verified' | 'forgot' | 'reset' | 'resetDone'

function messageOf(error: unknown): string {
  if (error instanceof CognitoError) return error.message
  return error instanceof Error ? error.message : 'Something went wrong. Try again.'
}

function PasswordToggle({ shown, onToggle, label }: { shown: boolean; onToggle: () => void; label: string }) {
  const Icon = shown ? EyeOff : Eye
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={`${shown ? 'Hide' : 'Show'} ${label}`}
      aria-pressed={shown}
      className="flex size-8 items-center justify-center rounded-sm text-muted hover:text-fg"
    >
      <Icon aria-hidden="true" className="size-4" />
    </button>
  )
}

/** Real Cognito: in-app registration + e-mail verification, sign-in through the hosted
 *  login page with OAuth 2.0 Authorization Code + PKCE. */
export function CognitoAuthPanel({ service, returnTo }: { service: CognitoAuthService; returnTo: string }) {
  const [view, setView] = useState<View>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [code, setCode] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [busy, setBusy] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)

  const emailError = submitted && !isPlausibleEmail(email) ? 'Enter a valid e-mail address.' : null
  const passwordError = submitted && !passwordMeetsPolicy(password) ? 'The password does not meet the policy below.' : null
  const confirmError = submitted && confirm !== password ? 'The passwords do not match.' : null

  function switchView(next: View) {
    setView(next)
    setSubmitted(false)
    setFormError(null)
    setInfo(null)
  }

  async function run(action: () => Promise<void>) {
    setBusy(true)
    setFormError(null)
    try {
      await action()
    } catch (error) {
      setFormError(messageOf(error))
    } finally {
      setBusy(false)
    }
  }

  function signIn(event: FormEvent) {
    event.preventDefault()
    setSubmitted(true)
    if (email && !isPlausibleEmail(email)) return
    void run(() => service.startSignIn({ loginHint: email.trim() || undefined, returnTo }))
  }

  function register(event: FormEvent) {
    event.preventDefault()
    setSubmitted(true)
    if (!isPlausibleEmail(email) || !passwordMeetsPolicy(password) || confirm !== password) return
    void run(async () => {
      const result = await service.idp.signUp(email.trim(), password)
      setPassword('')
      setConfirm('')
      if (result.userConfirmed) {
        switchView('verified')
      } else {
        switchView('verify')
        setInfo(`We sent a verification code to ${result.codeDestination ?? 'your e-mail address'}.`)
      }
    })
  }

  function verify(event: FormEvent) {
    event.preventDefault()
    setSubmitted(true)
    if (!/^\d{6}$/.test(code.trim())) return
    void run(async () => {
      await service.idp.confirmSignUp(email.trim(), code.trim())
      setCode('')
      switchView('verified')
    })
  }

  function requestReset(event: FormEvent) {
    event.preventDefault()
    setSubmitted(true)
    if (!isPlausibleEmail(email)) return
    void run(async () => {
      await service.idp.forgotPassword(email.trim())
      switchView('reset')
      // Same wording whether or not the account exists: do not reveal registered addresses.
      setInfo(`If an account exists for ${email.trim()}, a reset code has been sent to it.`)
    })
  }

  function confirmReset(event: FormEvent) {
    event.preventDefault()
    setSubmitted(true)
    if (!/^\d{6}$/.test(code.trim()) || !passwordMeetsPolicy(password) || confirm !== password) return
    void run(async () => {
      await service.idp.confirmForgotPassword(email.trim(), code.trim(), password)
      setCode('')
      setPassword('')
      setConfirm('')
      switchView('resetDone')
    })
  }

  function resend() {
    void run(async () => {
      const result = await service.idp.resendConfirmationCode(email.trim())
      setInfo(`A new code was sent to ${result.codeDestination ?? 'your e-mail address'}.`)
    })
  }

  const alert = formError ? (
    <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger-ink">
      {formError}
    </p>
  ) : null
  const notice = info ? (
    <p role="status" className="rounded-md bg-success-soft px-3 py-2 text-sm text-success-ink">
      {info}
    </p>
  ) : null

  return (
    <Card className="p-6">
      {view === 'signin' || view === 'register' ? (
        <div role="tablist" aria-label="Authentication" className="mb-5 grid grid-cols-2 gap-1 rounded-md bg-subtle p-1">
          {(['signin', 'register'] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              role="tab"
              aria-selected={view === tab}
              onClick={() => switchView(tab)}
              className={cx(
                'h-8 rounded-sm text-sm font-medium',
                view === tab ? 'bg-surface text-fg shadow-card' : 'text-muted hover:text-fg',
              )}
            >
              {tab === 'signin' ? 'Sign in' : 'Create account'}
            </button>
          ))}
        </div>
      ) : null}

      {view === 'signin' ? (
        <form onSubmit={signIn} noValidate className="flex flex-col gap-4">
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-fg">Sign in</h1>
            <p className="mt-1.5 text-sm text-muted">
              You will enter your password on the Amazon Cognito sign-in page. This app never sees it.
            </p>
          </div>
          {alert}
          <Input
            label="E-mail address (optional)"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            error={email && submitted && !isPlausibleEmail(email) ? 'Enter a valid e-mail address.' : null}
            hint="Pre-fills the sign-in page."
          />
          <Button type="submit" variant="primary" loading={busy} icon={<ShieldCheck aria-hidden="true" className="size-4" />}>
            Continue to secure sign-in
          </Button>
          <button
            type="button"
            className="self-start text-sm font-medium text-accent-ink underline-offset-2 hover:underline"
            onClick={() => switchView('forgot')}
          >
            Forgot your password?
          </button>
        </form>
      ) : null}

      {view === 'register' ? (
        <form onSubmit={register} noValidate className="flex flex-col gap-4">
          <h1 className="text-xl font-semibold tracking-tight text-fg">Create your account</h1>
          {alert}
          <Input
            label="E-mail address"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            error={emailError}
          />
          <Input
            label="Password"
            type={showPassword ? 'text' : 'password'}
            autoComplete="new-password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            error={passwordError}
            trailing={
              <PasswordToggle shown={showPassword} onToggle={() => setShowPassword((v) => !v)} label="password" />
            }
          />
          <ul aria-label="Password policy" className="grid gap-1 text-xs sm:grid-cols-2">
            {PASSWORD_RULES.map((rule) => {
              const met = rule.test(password)
              const Icon = met ? Check : Circle
              return (
                <li key={rule.id} className={cx('flex items-center gap-1.5', met ? 'text-success-ink' : 'text-muted')}>
                  <Icon aria-hidden="true" className="size-3.5 shrink-0" />
                  {rule.label}
                  <span className="sr-only">{met ? ' (met)' : ' (not met)'}</span>
                </li>
              )
            })}
          </ul>
          <Input
            label="Confirm password"
            type={showConfirm ? 'text' : 'password'}
            autoComplete="new-password"
            required
            value={confirm}
            onChange={(event) => setConfirm(event.target.value)}
            error={confirmError}
            trailing={
              <PasswordToggle shown={showConfirm} onToggle={() => setShowConfirm((v) => !v)} label="password confirmation" />
            }
          />
          <Button type="submit" variant="primary" loading={busy}>
            Create account
          </Button>
        </form>
      ) : null}

      {view === 'verify' ? (
        <form onSubmit={verify} noValidate className="flex flex-col gap-4">
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-fg">Verify your e-mail</h1>
            <p className="mt-1.5 text-sm text-muted">Enter the 6-digit code sent to {email.trim()}.</p>
          </div>
          {alert}
          {notice}
          <Input
            label="Verification code"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            value={code}
            onChange={(event) => setCode(event.target.value.replace(/\D/g, ''))}
            error={submitted && !/^\d{6}$/.test(code) ? 'Enter the 6-digit code.' : null}
          />
          <Button type="submit" variant="primary" loading={busy}>
            Verify e-mail
          </Button>
          <div className="flex justify-between text-sm">
            <button type="button" className="font-medium text-accent-ink underline-offset-2 hover:underline" onClick={resend} disabled={busy}>
              Send a new code
            </button>
            <button type="button" className="text-muted hover:text-fg" onClick={() => switchView('register')}>
              Use a different e-mail
            </button>
          </div>
        </form>
      ) : null}

      {view === 'forgot' ? (
        <form onSubmit={requestReset} noValidate className="flex flex-col gap-4">
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-fg">Reset your password</h1>
            <p className="mt-1.5 text-sm text-muted">Enter your e-mail address and we will send you a reset code.</p>
          </div>
          {alert}
          <Input
            label="E-mail address"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            error={emailError}
          />
          <Button type="submit" variant="primary" loading={busy}>
            Send reset code
          </Button>
          <button type="button" className="self-start text-sm text-muted hover:text-fg" onClick={() => switchView('signin')}>
            Back to sign in
          </button>
        </form>
      ) : null}

      {view === 'reset' ? (
        <form onSubmit={confirmReset} noValidate className="flex flex-col gap-4">
          <h1 className="text-xl font-semibold tracking-tight text-fg">Choose a new password</h1>
          {alert}
          {notice}
          <Input
            label="Reset code"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            value={code}
            onChange={(event) => setCode(event.target.value.replace(/\D/g, ''))}
            error={submitted && !/^\d{6}$/.test(code) ? 'Enter the 6-digit code.' : null}
          />
          <Input
            label="New password"
            type={showPassword ? 'text' : 'password'}
            autoComplete="new-password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            error={passwordError}
            trailing={
              <PasswordToggle shown={showPassword} onToggle={() => setShowPassword((v) => !v)} label="password" />
            }
          />
          <ul aria-label="Password policy" className="grid gap-1 text-xs sm:grid-cols-2">
            {PASSWORD_RULES.map((rule) => {
              const met = rule.test(password)
              const Icon = met ? Check : Circle
              return (
                <li key={rule.id} className={cx('flex items-center gap-1.5', met ? 'text-success-ink' : 'text-muted')}>
                  <Icon aria-hidden="true" className="size-3.5 shrink-0" />
                  {rule.label}
                  <span className="sr-only">{met ? ' (met)' : ' (not met)'}</span>
                </li>
              )
            })}
          </ul>
          <Input
            label="Confirm new password"
            type={showConfirm ? 'text' : 'password'}
            autoComplete="new-password"
            required
            value={confirm}
            onChange={(event) => setConfirm(event.target.value)}
            error={confirmError}
            trailing={
              <PasswordToggle shown={showConfirm} onToggle={() => setShowConfirm((v) => !v)} label="password confirmation" />
            }
          />
          <Button type="submit" variant="primary" loading={busy}>
            Set new password
          </Button>
          <button type="button" className="self-start text-sm text-muted hover:text-fg" onClick={() => switchView('forgot')}>
            Send a new code
          </button>
        </form>
      ) : null}

      {view === 'resetDone' ? (
        <div className="flex flex-col gap-4">
          <div role="status">
            <h1 className="text-xl font-semibold tracking-tight text-fg">Password changed</h1>
            <p className="mt-1.5 text-sm text-muted">You can now sign in with your new password.</p>
          </div>
          {alert}
          <Button
            variant="primary"
            loading={busy}
            onClick={() => void run(() => service.startSignIn({ loginHint: email.trim(), returnTo }))}
          >
            Continue to sign in
          </Button>
        </div>
      ) : null}

      {view === 'verified' ? (
        <div className="flex flex-col gap-4">
          <div role="status">
            <h1 className="text-xl font-semibold tracking-tight text-fg">Account ready</h1>
            <p className="mt-1.5 text-sm text-muted">Your e-mail address is verified. You can sign in now.</p>
          </div>
          {alert}
          <Button
            variant="primary"
            loading={busy}
            onClick={() => void run(() => service.startSignIn({ loginHint: email.trim(), returnTo }))}
          >
            Continue to sign in
          </Button>
        </div>
      ) : null}
    </Card>
  )
}
