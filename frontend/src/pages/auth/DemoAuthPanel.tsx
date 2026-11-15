import { ArrowRight } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Card } from '../../components/ui/Card'
import { BackendCommand } from '../../components/ui/ErrorState'
import { Spinner } from '../../components/ui/Spinner'
import { useApi } from '../../hooks/useApi'
import { DEMO_IDENTITIES, type DemoAuthService } from '../../services/auth/demoAuth'
import { checkDemoBackend } from '../../services/health'

type Health = 'checking' | 'up' | 'down'

/** Local Demo sign-in: pick one of the identities the local backend trusts. No passwords,
 *  no tokens - this is deliberately not presented as real authentication. */
export function DemoAuthPanel({ service }: { service: DemoAuthService }) {
  const { client } = useApi()
  const [health, setHealth] = useState<Health>('checking')
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    checkDemoBackend(client, controller.signal)
      .then(() => setHealth('up'))
      .catch(() => {
        if (!controller.signal.aborted) setHealth('down')
      })
    return () => controller.abort()
  }, [client, attempt])

  return (
    <Card className="p-6">
      <h1 className="text-xl font-semibold tracking-tight text-fg">Choose a demo identity</h1>
      <p className="mt-1.5 text-sm text-muted">
        These are simulated users for the Local Demo — there is no password and no Cognito. Each identity has
        its own private notes, so you can switch between them to see user isolation at work.
      </p>

      {health === 'down' ? (
        <div role="alert" className="mt-5 rounded-md border border-line bg-danger-soft p-3 text-sm text-danger-ink">
          <p className="font-medium">The local backend is not reachable at {client.baseUrl}.</p>
          <p className="mt-1">Start it in another terminal, then retry:</p>
          <BackendCommand />
          <button
            type="button"
            className="mt-2 font-medium underline underline-offset-2"
            onClick={() => {
              setHealth('checking')
              setAttempt((value) => value + 1)
            }}
          >
            Retry connection
          </button>
        </div>
      ) : null}
      {health === 'checking' ? (
        <p role="status" className="mt-5 flex items-center gap-2 text-sm text-muted">
          <Spinner label="Connecting to the local backend" /> Connecting to the local backend…
        </p>
      ) : null}

      <ul className="mt-5 flex flex-col gap-2">
        {DEMO_IDENTITIES.map((identity) => (
          <li key={identity.name}>
            <button
              type="button"
              disabled={health !== 'up'}
              onClick={() => service.signInAs(identity.name)}
              className="group flex w-full items-center gap-3 rounded-md border border-line-strong bg-surface p-3 text-left transition-colors hover:bg-subtle disabled:opacity-55"
            >
              <span
                aria-hidden="true"
                className="flex size-9 items-center justify-center rounded-md bg-accent-soft text-sm font-semibold text-accent-ink"
              >
                {identity.displayName.charAt(0)}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium text-fg">Continue as {identity.displayName}</span>
                <span className="block truncate text-xs text-muted">{identity.email} · demo identity</span>
              </span>
              <ArrowRight aria-hidden="true" className="size-4 text-faint group-hover:text-fg" />
            </button>
          </li>
        ))}
      </ul>
    </Card>
  )
}
