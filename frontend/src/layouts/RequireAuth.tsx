import { Navigate, useLocation } from 'react-router'
import { NotesProvider } from '../components/providers/NotesProvider'
import { Spinner } from '../components/ui/Spinner'
import { useAuth } from '../hooks/useAuth'
import { AppLayout } from './AppLayout'

/** Gate for every protected route. The server enforces access; this only routes the UI. */
export function RequireAuth() {
  const { status, user } = useAuth()
  const location = useLocation()

  if (status === 'loading') {
    return (
      <div className="flex min-h-dvh items-center justify-center text-muted" role="status">
        <Spinner label="Checking your session" />
        <span className="ml-3">Checking your session…</span>
      </div>
    )
  }
  if (status === 'signedOut' || !user) {
    return <Navigate to="/auth" replace state={{ from: location.pathname + location.search }} />
  }
  // key=user.id: switching identity discards every note loaded for the previous user.
  return (
    <NotesProvider key={user.id}>
      <AppLayout />
    </NotesProvider>
  )
}
