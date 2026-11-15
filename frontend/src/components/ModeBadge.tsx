import { Cloud, FlaskConical } from 'lucide-react'
import { useConfig } from '../hooks/useConfig'
import { Badge } from './ui/Badge'

/** Always-visible indicator of which backend the app is talking to. */
export function ModeBadge() {
  const { mode } = useConfig()
  return mode === 'demo' ? (
    <Badge tone="warning" className="gap-1.5">
      <FlaskConical aria-hidden="true" className="size-3.5" />
      Local Demo
    </Badge>
  ) : (
    <Badge tone="accent" className="gap-1.5">
      <Cloud aria-hidden="true" className="size-3.5" />
      AWS
    </Badge>
  )
}

export function DemoBanner() {
  const { mode } = useConfig()
  if (mode !== 'demo') return null
  return (
    <div
      data-testid="demo-banner"
      className="border-b border-line bg-warning-soft px-4 py-1.5 text-center text-xs text-warning-ink"
    >
      <strong className="font-semibold">Local Demo</strong> — notes are kept in memory on your computer and
      authentication is simulated. Amazon Cognito is not involved.
    </div>
  )
}
