import { Activity, ArrowDown, ArrowRight, ChevronLeft, ChevronRight, Database, FunctionSquare, KeyRound, MonitorSmartphone, RotateCcw, Waypoints } from 'lucide-react'
import { useState, type ComponentType } from 'react'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { PageHeader } from '../layouts/AppLayout'
import { cx } from '../utils/cx'
import { COMPONENTS, REQUEST_PATH, WALKTHROUGH, type ComponentId } from './architectureData'

const ICONS: Record<ComponentId, ComponentType<{ className?: string }>> = {
  browser: MonitorSmartphone,
  cognito: KeyRound,
  apigw: Waypoints,
  lambda: FunctionSquare,
  dynamodb: Database,
  cloudwatch: Activity,
}

function Node({
  id,
  selected,
  active,
  onSelect,
}: {
  id: ComponentId
  selected: boolean
  active: boolean
  onSelect: (id: ComponentId) => void
}) {
  const component = COMPONENTS[id]
  const Icon = ICONS[id]
  return (
    <button
      type="button"
      aria-pressed={selected}
      data-active={active || undefined}
      onClick={() => onSelect(id)}
      className={cx(
        'flex w-full min-w-0 items-center gap-3 rounded-lg border bg-surface p-3 text-left transition-colors md:flex-col md:items-start md:gap-2',
        selected ? 'border-accent ring-2 ring-accent/30' : 'border-line-strong hover:bg-subtle',
        active && 'bg-accent-soft',
      )}
    >
      <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-subtle text-fg">
        <Icon aria-hidden="true" className="size-4.5" />
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-fg">{component.name}</span>
        <span className="block text-xs text-muted">{component.kind}</span>
      </span>
    </button>
  )
}

function Arrow({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-center gap-1.5 py-1 text-xs text-muted md:flex-col md:px-1 md:py-0" aria-hidden="true">
      <ArrowDown className="size-4 md:hidden" />
      <span className="md:order-first md:text-center">{label}</span>
      <ArrowRight className="hidden size-4 md:block" />
    </div>
  )
}

const ARROW_LABELS = ['HTTPS + JWT', 'invokes', 'reads / writes']

export function ArchitecturePage() {
  useDocumentTitle('Architecture')
  const [selected, setSelected] = useState<ComponentId>('apigw')
  const [step, setStep] = useState<number | null>(null)
  const current = step === null ? null : WALKTHROUGH[step]
  const activeId = current?.at ?? null
  const detail = COMPONENTS[selected]

  function goTo(next: number | null) {
    setStep(next)
    const target = next === null ? undefined : WALKTHROUGH[next]
    if (target) setSelected(target.at)
  }

  return (
    <>
      <PageHeader
        title="Architecture explorer"
        description="How one request travels through the system. Select a component to see what it does and what it checks."
      />

      <Card className="p-4 sm:p-6">
        <h2 className="sr-only">System diagram</h2>
        <div className="flex flex-col gap-4">
          <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_auto_minmax(0,1fr)_auto_minmax(0,1fr)] md:items-center">
            <div className="md:col-span-7">
              <p className="mb-2 text-xs font-medium tracking-wide text-muted uppercase">Authentication</p>
            </div>
            <div className="md:col-start-1">
              <Node id="cognito" selected={selected === 'cognito'} active={activeId === 'cognito'} onSelect={setSelected} />
            </div>
            <p className="text-xs text-muted md:col-span-6 md:pl-3">
              Issues signed tokens to the browser at sign-in. API Gateway verifies each token against Cognito’s
              public keys — Cognito itself is not called on every request.
            </p>
          </div>

          <div>
            <p className="mb-2 text-xs font-medium tracking-wide text-muted uppercase">Request path</p>
            <ol className="grid md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_auto_minmax(0,1fr)_auto_minmax(0,1fr)] md:items-stretch">
              {REQUEST_PATH.map((id, index) => (
                <li key={id} className="contents">
                  <Node id={id} selected={selected === id} active={activeId === id} onSelect={setSelected} />
                  {index < REQUEST_PATH.length - 1 ? <Arrow label={ARROW_LABELS[index] ?? ''} /> : null}
                </li>
              ))}
            </ol>
          </div>

          <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_auto_minmax(0,1fr)_auto_minmax(0,1fr)] md:items-center">
            <div className="md:col-span-7">
              <p className="mb-2 text-xs font-medium tracking-wide text-muted uppercase">Observability (not on the request path)</p>
            </div>
            <div className="md:col-start-3 md:col-span-3">
              <Node id="cloudwatch" selected={selected === 'cloudwatch'} active={activeId === 'cloudwatch'} onSelect={setSelected} />
            </div>
            <p className="text-xs text-muted md:col-span-2 md:pl-3">API Gateway and Lambda send logs and metrics here on the side.</p>
          </div>
        </div>
      </Card>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card className="p-4 sm:p-6" aria-live="polite">
          <section aria-labelledby="detail-heading" data-testid="component-detail">
            <p className="text-xs font-medium tracking-wide text-muted uppercase">{detail.kind}</p>
            <h2 id="detail-heading" className="mt-1 text-lg font-semibold text-fg">
              {detail.name}
            </h2>
            <p className="mt-2 text-sm text-muted">{detail.summary}</p>
            <h3 className="mt-4 text-sm font-semibold text-fg">What it does</h3>
            <ul className="mt-1.5 list-disc space-y-1 pl-5 text-sm text-muted">
              {detail.does.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
            <h3 className="mt-4 text-sm font-semibold text-fg">What it checks</h3>
            <ul className="mt-1.5 list-disc space-y-1 pl-5 text-sm text-muted">
              {detail.checks.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
            <h3 className="mt-4 text-sm font-semibold text-fg">Where to look in the repository</h3>
            <ul className="mt-1.5 space-y-1 text-xs">
              {detail.files.map((file) => (
                <li key={file}>
                  <code className="rounded-sm bg-subtle px-1.5 py-0.5 text-fg">{file}</code>
                </li>
              ))}
            </ul>
          </section>
        </Card>

        <Card className="flex flex-col p-4 sm:p-6">
          <section aria-labelledby="walk-heading" className="flex flex-1 flex-col">
            <h2 id="walk-heading" className="text-lg font-semibold text-fg">
              Walkthrough: creating a note
            </h2>
            <p className="mt-1 text-sm text-muted">
              Follow an authorized <code className="rounded-sm bg-subtle px-1 py-0.5">POST /notes</code> one step at a time.
            </p>
            <div className="mt-4 min-h-36 flex-1 rounded-md border border-line bg-canvas p-4" role="status" data-testid="walkthrough-step">
              {current && step !== null ? (
                <>
                  <p className="text-xs font-medium text-accent-ink">
                    Step {step + 1} of {WALKTHROUGH.length} · {COMPONENTS[current.at].name}
                  </p>
                  <p className="mt-1 text-sm font-semibold text-fg">{current.title}</p>
                  <p className="mt-1.5 text-sm text-muted">{current.detail}</p>
                </>
              ) : (
                <p className="text-sm text-muted">Press “Start” to begin. The component handling each step is highlighted in the diagram.</p>
              )}
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              {step === null ? (
                <Button variant="primary" onClick={() => goTo(0)}>
                  Start
                </Button>
              ) : (
                <>
                  <Button onClick={() => goTo(step - 1)} disabled={step === 0} icon={<ChevronLeft aria-hidden="true" className="size-4" />}>
                    Back
                  </Button>
                  <Button variant="primary" onClick={() => goTo(step + 1)} disabled={step === WALKTHROUGH.length - 1}>
                    Next step
                    <ChevronRight aria-hidden="true" className="size-4" />
                  </Button>
                  <Button variant="ghost" onClick={() => goTo(null)} icon={<RotateCcw aria-hidden="true" className="size-4" />}>
                    Reset
                  </Button>
                </>
              )}
            </div>
          </section>
        </Card>
      </div>
    </>
  )
}
