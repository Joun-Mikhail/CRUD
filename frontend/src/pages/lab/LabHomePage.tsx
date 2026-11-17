import { FileText, FlaskConical, Plus } from 'lucide-react'
import { useMemo } from 'react'
import { Link } from 'react-router'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { buttonClasses } from '../../components/ui/buttonStyles'
import { Card } from '../../components/ui/Card'
import { ErrorState } from '../../components/ui/ErrorState'
import { Skeleton } from '../../components/ui/Skeleton'
import { useDocumentTitle } from '../../hooks/useDocumentTitle'
import { useNotes } from '../../hooks/useNotes'
import { formatLabDate, fromNote } from '../../lab/experimentFormat'
import { evaluateExperiment } from '../../lab/ohmsLaw'
import { LabHero } from '../../lab/LabHero'
import { formatRelative } from '../../utils/format'

/** /lab — the LabProof entry point: every experiment among the notes loaded so far. */
export function LabHomePage() {
  useDocumentTitle('LabProof experiments')
  const notes = useNotes()

  const experiments = useMemo(
    () =>
      notes.notes.flatMap((note) => {
        const experiment = fromNote(note)
        return experiment ? [{ note, experiment, result: evaluateExperiment(experiment).result }] : []
      }),
    [notes.notes],
  )

  return (
    <>
      <LabHero
        title="Ohm’s law verification"
        text="Record your measurements, let LabProof calculate the resistance and draw the V–I graph, then print a clean lab report."
        action={
          <Link to="/lab/new" className={buttonClasses('inverse')}>
            <Plus aria-hidden="true" className="size-4" />
            New experiment
          </Link>
        }
      />

      <section aria-labelledby="experiments-heading" className="mt-8">
        <h2 id="experiments-heading" className="mb-3 text-base font-semibold text-fg">
          Your experiments
        </h2>

        {notes.status === 'loading' ? (
          <div role="status" aria-label="Loading your experiments" className="grid gap-3 sm:grid-cols-2">
            <Skeleton className="h-32" />
            <Skeleton className="h-32" />
          </div>
        ) : null}
        {notes.status === 'error' ? <ErrorState error={notes.error} onRetry={notes.reload} /> : null}

        {notes.status === 'ready' && experiments.length === 0 ? (
          <Card className="flex flex-col items-center px-6 py-10 text-center">
            <span className="flex size-11 items-center justify-center rounded-full bg-violet-soft text-violet-ink">
              <FlaskConical aria-hidden="true" className="size-5" />
            </span>
            <h3 className="mt-3 text-base font-semibold text-fg">No experiments yet</h3>
            <p className="mt-1 max-w-md text-sm text-muted">
              Start your first Ohm’s law experiment. It is stored through the secured notes API and only you can see it.
            </p>
            <Link to="/lab/new" className={buttonClasses('primary', 'md', 'mt-4')}>
              <Plus aria-hidden="true" className="size-4" />
              Start an experiment
            </Link>
          </Card>
        ) : null}

        {experiments.length > 0 ? (
          <ul className="grid gap-3 sm:grid-cols-2">
            {experiments.map(({ note, experiment, result }) => (
              <li
                key={note.noteId}
                className="group relative flex flex-col rounded-lg border border-line bg-surface p-4 shadow-card transition-colors hover:border-accent"
              >
                <div className="flex items-start justify-between gap-3">
                  <h3 className="min-w-0 text-sm font-semibold text-fg">
                    <Link to={`/lab/${note.noteId}`} className="after:absolute after:inset-0">
                      {note.title}
                    </Link>
                  </h3>
                  {result ? (
                    <Badge tone={result.withinTolerance ? 'success' : 'warning'}>
                      {result.withinTolerance ? 'PASS' : 'CHECK'}
                    </Badge>
                  ) : null}
                </div>
                <p className="mt-1 text-sm text-muted">
                  {experiment.course} · {formatLabDate(experiment.date)}
                </p>
                <p className="mt-0.5 text-xs text-muted">
                  {experiment.readings.length} readings · updated {formatRelative(note.updatedAt)}
                </p>
                <div className="mt-3">
                  <Link
                    to={`/lab/${note.noteId}/report`}
                    className={buttonClasses('secondary', 'sm', 'relative z-10')}
                    aria-label={`Lab report for “${note.title}”`}
                  >
                    <FileText aria-hidden="true" className="size-4" />
                    Report
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        ) : null}

        {notes.hasMore ? (
          <div className="mt-4 flex flex-wrap items-center gap-3 text-xs text-muted">
            <Button size="sm" loading={notes.loadingMore} onClick={notes.loadMore}>
              Load more notes
            </Button>
            Only experiments among the notes loaded so far are listed.
          </div>
        ) : null}
      </section>
    </>
  )
}
