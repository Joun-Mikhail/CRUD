import { Navigate, useLocation } from 'react-router'
import { Logo } from '../components/Logo'
import { DemoBanner, ModeBadge } from '../components/ModeBadge'
import { Spinner } from '../components/ui/Spinner'
import { useAuth } from '../hooks/useAuth'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { CognitoAuthService, safeReturnPath } from '../services/auth/cognitoAuth'
import { DemoAuthService } from '../services/auth/demoAuth'
import type { AuthNotice } from '../services/auth/types'
import { CognitoAuthPanel } from './auth/CognitoAuthPanel'
import { DemoAuthPanel } from './auth/DemoAuthPanel'

const NOTICES: Record<Exclude<AuthNotice, null>, string> = {
  'session-expired': 'Your session has expired. Sign in again to continue.',
  'signed-out': 'You have been signed out.',
}

export function AuthPage() {
  useDocumentTitle('Sign in')
  const { status, notice, service } = useAuth()
  const location = useLocation()
  const from = safeReturnPath((location.state as { from?: unknown } | null)?.from)

  if (status === 'signedIn') return <Navigate to={from} replace />

  return (
    <div className="flex min-h-dvh flex-col bg-canvas">
      <DemoBanner />
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 py-10">
        <div className="mb-6 flex items-center justify-between">
          <Logo className="text-base" />
          <ModeBadge />
        </div>
        {notice ? (
          <p role="status" className="mb-4 rounded-md border border-line bg-surface px-3 py-2 text-sm text-fg">
            {NOTICES[notice]}
          </p>
        ) : null}
        {status === 'loading' ? (
          <div role="status" className="flex items-center gap-3 py-10 text-muted">
            <Spinner label="Checking your session" /> Checking your session…
          </div>
        ) : service instanceof DemoAuthService ? (
          <DemoAuthPanel service={service} />
        ) : service instanceof CognitoAuthService ? (
          <CognitoAuthPanel service={service} returnTo={from} />
        ) : null}
        <p className="mt-8 text-center text-xs text-faint">
          Secure serverless CRUD API with authentication — bachelor thesis reference implementation.
        </p>
      </main>
    </div>
  )
}
