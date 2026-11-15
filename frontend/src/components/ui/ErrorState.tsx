import { RotateCw, TriangleAlert } from 'lucide-react'
import { useContext, type ReactNode } from 'react'
import { ConfigContext } from '../../hooks/useConfig'
import { DEMO_BACKEND_COMMAND } from '../../services/health'
import { cx } from '../../utils/cx'
import { summarizeError } from '../../utils/errors'
import { Button } from './Button'

export function ErrorState({
  error,
  title,
  onRetry,
  action,
  className,
}: {
  error: unknown
  title?: string
  onRetry?: () => void
  action?: ReactNode
  className?: string
}) {
  const config = useContext(ConfigContext)
  const summary = summarizeError(error)
  const demoBackendDown = summary.network && config?.mode === 'demo'

  return (
    <div
      role="alert"
      className={cx(
        'flex flex-col items-center rounded-lg border border-line bg-surface px-6 py-10 text-center',
        className,
      )}
    >
      <div className="mb-4 flex size-11 items-center justify-center rounded-full bg-danger-soft text-danger-ink">
        <TriangleAlert className="size-5" aria-hidden="true" />
      </div>
      <h2 className="text-base font-semibold text-fg">{title ?? summary.title}</h2>
      <p className="mt-1 max-w-md text-sm text-muted">
        {demoBackendDown
          ? `The local demo backend at ${config.apiBaseUrl} did not answer. Nothing was loaded or saved.`
          : summary.message}
      </p>
      {demoBackendDown ? <BackendCommand /> : null}
      {summary.code && !summary.network ? (
        <p className="mt-3 font-mono text-xs text-muted">
          {summary.code}
          {summary.requestId ? ` · request ${summary.requestId}` : ''}
        </p>
      ) : null}
      {onRetry || action ? (
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          {onRetry ? (
            <Button onClick={onRetry} icon={<RotateCw className="size-4" aria-hidden="true" />}>
              Try again
            </Button>
          ) : null}
          {action}
        </div>
      ) : null}
    </div>
  )
}

export function BackendCommand() {
  return (
    <div className="mt-4 w-full max-w-xl text-left">
      <p className="mb-1 text-xs text-muted">Start it from the repository root, then try again:</p>
      <pre className="overflow-x-auto rounded-md border border-line bg-subtle px-3 py-2 text-xs text-fg">
        <code>{DEMO_BACKEND_COMMAND}</code>
      </pre>
    </div>
  )
}
