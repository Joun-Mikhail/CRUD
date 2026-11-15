import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { buttonClasses } from '../components/ui/buttonStyles'
import { Spinner } from '../components/ui/Spinner'
import { useAuth } from '../hooks/useAuth'
import { CognitoAuthService } from '../services/auth/cognitoAuth'

/** Landing route for the redirect back from the Cognito hosted login (`?code=…&state=…`). */
export function AuthCallbackPage() {
  const { service } = useAuth()
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const [failure, setFailure] = useState<string | null>(null)

  useEffect(() => {
    if (!(service instanceof CognitoAuthService)) {
      void navigate('/auth', { replace: true })
      return
    }
    let active = true
    service
      .completeSignIn(params)
      .then((returnTo) => {
        if (active) void navigate(returnTo, { replace: true })
      })
      .catch((error: unknown) => {
        if (active) setFailure(error instanceof Error ? error.message : 'Sign-in could not be completed.')
      })
    return () => {
      active = false
    }
  }, [service, params, navigate])

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center px-6 text-center">
      {failure ? (
        <div role="alert">
          <h1 className="text-lg font-semibold text-fg">Sign-in failed</h1>
          <p className="mt-2 text-sm text-muted">{failure}</p>
          <Link to="/auth" className={buttonClasses('primary', 'md', 'mt-5')}>
            Back to sign in
          </Link>
        </div>
      ) : (
        <div role="status" className="flex items-center gap-3 text-muted">
          <Spinner label="Completing sign-in" />
          Completing sign-in…
        </div>
      )}
    </main>
  )
}
