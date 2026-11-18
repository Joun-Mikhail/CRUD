import { ArrowLeft, FileText, FlaskConical, Save, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { Link, useBlocker, useNavigate, useParams } from 'react-router'
import { Button } from '../../components/ui/Button'
import { buttonClasses } from '../../components/ui/buttonStyles'
import { Card } from '../../components/ui/Card'
import { ConfirmDialog } from '../../components/ui/Dialog'
import { ErrorState } from '../../components/ui/ErrorState'
import { Input, Textarea } from '../../components/ui/Field'
import { Skeleton } from '../../components/ui/Skeleton'
import { useApi } from '../../hooks/useApi'
import { useDocumentTitle } from '../../hooks/useDocumentTitle'
import { useNotes } from '../../hooks/useNotes'
import { useToast } from '../../hooks/useToast'
import {
  emptyExperiment,
  TEXT_LIMITS,
  todayIso,
  toNoteInput,
  validateDetails,
  type LabExperiment,
} from '../../lab/experimentFormat'
import { evaluateExperiment, EXAMPLE_INPUT, matchesExample, TOLERANCE_OPTIONS } from '../../lab/ohmsLaw'
import { ReadingsTable } from '../../lab/ReadingsTable'
import { ResultSummary } from '../../lab/ResultSummary'
import { useExperimentNote } from '../../lab/useExperimentNote'
import { VIChart } from '../../lab/VIChart'
import { PageHeader } from '../../layouts/AppLayout'
import { isApiError } from '../../services/apiClient'
import type { Note } from '../../types/api'
import { summarizeError } from '../../utils/errors'
import { charCount, validateNote } from '../../utils/noteValidation'

const LOAD_TITLES: Record<string, string> = {
  FORBIDDEN: 'This experiment belongs to another account',
  NOT_FOUND: 'This experiment does not exist',
  VALIDATION_ERROR: 'This is not a valid experiment address',
}

function Section({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <Card className="p-4 sm:p-6">
      <h2 className="mb-4 flex items-center gap-2.5 text-base font-semibold text-fg">
        <span
          aria-hidden="true"
          className="flex size-7 items-center justify-center rounded-md bg-accent-soft text-xs font-bold text-accent-ink"
        >
          {n}
        </span>
        {title}
      </h2>
      {children}
    </Card>
  )
}

const backLink = (
  <Link to="/lab" className={buttonClasses('ghost', 'sm', '-ml-2 mb-3')}>
    <ArrowLeft aria-hidden="true" className="size-4" />
    All experiments
  </Link>
)

/** Route element for /lab/new and /lab/:noteId. Loads the note, then hands it to the form. */
export function ExperimentEditorPage() {
  const { noteId } = useParams()
  const [reloadKey, setReloadKey] = useState(0)
  const load = useExperimentNote(noteId, reloadKey)
  const reload = useCallback(() => setReloadKey((key) => key + 1), [])
  useDocumentTitle(noteId ? 'Edit experiment' : 'New experiment')

  if (!noteId) return <ExperimentForm key="new" saved={null} initial={emptyExperiment(todayIso())} onReload={reload} />

  if (load.status === 'loading') {
    return (
      <>
        {backLink}
        <div role="status" aria-label="Loading experiment" className="flex flex-col gap-4">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-40" />
          <Skeleton className="h-72" />
        </div>
      </>
    )
  }
  if (load.status === 'error') {
    const code = summarizeError(load.error).code ?? ''
    return (
      <>
        {backLink}
        <ErrorState
          error={load.error}
          title={LOAD_TITLES[code]}
          onRetry={code in LOAD_TITLES ? undefined : reload}
          action={
            code in LOAD_TITLES ? (
              <Link to="/lab" className={buttonClasses('primary')}>
                Back to your experiments
              </Link>
            ) : undefined
          }
        />
      </>
    )
  }
  if (load.status === 'not-experiment') {
    return (
      <>
        {backLink}
        <Card className="p-6 text-sm">
          <h1 className="text-lg font-semibold text-fg">This note is not a LabProof experiment</h1>
          <p className="mt-1 text-muted">
            “{load.note.title}” is an ordinary note (or its experiment data could not be read), so it opens in the
            note editor instead.
          </p>
          <Link to={`/notes/${load.note.noteId}`} className={buttonClasses('primary', 'md', 'mt-4')}>
            Open in the note editor
          </Link>
        </Card>
      </>
    )
  }
  return (
    <ExperimentForm
      key={`${load.note.noteId}:${load.note.version}`}
      saved={load.note}
      initial={load.experiment}
      onReload={reload}
    />
  )
}

function ExperimentForm({
  saved: savedNote,
  initial,
  onReload,
}: {
  saved: Note | null
  initial: LabExperiment
  onReload: () => void
}) {
  const { notes: api } = useApi()
  const notes = useNotes()
  const toast = useToast()
  const navigate = useNavigate()

  const [exp, setExp] = useState<LabExperiment>(initial)
  /** The last saved state, to detect unsaved changes. */
  const [baseline, setBaseline] = useState(() => JSON.stringify(initial))
  const [saved, setSaved] = useState<Note | null>(savedNote)
  const [submitted, setSubmitted] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<unknown>(null)
  const [conflict, setConflict] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  /** Set right before a deliberate navigation (after create/delete) so the guard stays quiet. */
  const leaving = useRef(false)

  const dirty = JSON.stringify(exp) !== baseline
  const { errors, result } = useMemo(() => evaluateExperiment(exp), [exp])
  const detailErrors = useMemo(() => validateDetails(exp), [exp])
  const hasErrors = Object.keys(detailErrors).length > 0 || result === null

  const set = <K extends keyof LabExperiment>(field: K, value: LabExperiment[K]) =>
    setExp((current) => ({ ...current, [field]: value }))

  // Unsaved-changes protection, as in the note editor.
  const blocker = useBlocker(useCallback(() => dirty && !leaving.current, [dirty]))
  useEffect(() => {
    if (!dirty) return
    const warn = (event: BeforeUnloadEvent) => event.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  async function save(event: FormEvent) {
    event.preventDefault()
    setSubmitted(true)
    setSaveError(null)
    if (saving || hasErrors) return
    const input = toNoteInput(exp)
    if (!input) return
    const sizeProblem = validateNote(input.title, input.content).content
    if (sizeProblem) {
      setSaveError(new Error(`The experiment is too large to store: ${sizeProblem}`))
      return
    }
    setSaving(true)
    try {
      // The existing endpoints: POST /notes to create, PUT /notes/{id} with the version to update.
      const note = saved ? await api.update(saved.noteId, { ...input, version: saved.version }) : await api.create(input)
      notes.upsert(note)
      toast.success(saved ? 'Experiment saved' : 'Experiment created')
      if (saved) {
        setSaved(note)
        setBaseline(JSON.stringify(exp))
        setSubmitted(false)
      } else {
        leaving.current = true
        void navigate(`/lab/${note.noteId}`, { replace: true })
      }
    } catch (error) {
      if (isApiError(error) && error.code === 'VERSION_CONFLICT') setConflict(true)
      else setSaveError(error)
    } finally {
      setSaving(false)
    }
  }

  async function remove() {
    if (!saved) return
    setDeleting(true)
    try {
      await api.remove(saved.noteId)
      notes.remove(saved.noteId)
      toast.success('Experiment deleted')
      leaving.current = true
      void navigate('/lab', { replace: true })
    } catch (error) {
      toast.error(`Could not delete the experiment: ${summarizeError(error).message}`)
      setDeleting(false)
      setConfirmDelete(false)
    }
  }

  const show = <T,>(value: T) => (submitted ? value : undefined)

  return (
    <>
      {backLink}
      <PageHeader
        title={saved ? saved.title : 'New experiment'}
        description={
          <span className="inline-flex items-center gap-1.5">
            <FlaskConical aria-hidden="true" className="size-4 text-violet-ink" />
            LabProof Lite · Ohm’s law verification
          </span>
        }
        actions={
          <>
            {!saved ? (
              <Button
                icon={<FlaskConical aria-hidden="true" className="size-4" />}
                onClick={() => setExp((current) => ({ ...current, ...EXAMPLE_INPUT, readings: [...EXAMPLE_INPUT.readings] }))}
              >
                Fill illustrative example
              </Button>
            ) : null}
            {saved && !dirty ? (
              <Link to={`/lab/${saved.noteId}/report`} className={buttonClasses('secondary')}>
                <FileText aria-hidden="true" className="size-4" />
                Lab report
              </Link>
            ) : null}
            {saved ? (
              <Button
                variant="ghost"
                icon={<Trash2 aria-hidden="true" className="size-4" />}
                onClick={() => setConfirmDelete(true)}
              >
                Delete
              </Button>
            ) : null}
          </>
        }
      />

      <form noValidate aria-label={saved ? 'Edit experiment' : 'New experiment'} onSubmit={(event) => void save(event)}>
        <div className="flex flex-col gap-5">
          {conflict ? (
            <div role="alert" className="rounded-lg bg-warning-soft p-4 text-sm text-warning-ink">
              <p className="font-medium">This experiment was changed somewhere else after you opened it.</p>
              <p className="mt-1">Nothing was overwritten. Copy anything you want to keep, then load the latest version.</p>
              <Button size="sm" className="mt-2" onClick={onReload}>
                Discard my changes and load the latest version
              </Button>
            </div>
          ) : null}
          {submitted && hasErrors ? (
            <p role="alert" className="rounded-lg bg-danger-soft px-4 py-3 text-sm font-medium text-danger-ink">
              Some fields need attention before the experiment can be saved.
            </p>
          ) : null}

          <details className="group rounded-lg border border-line bg-surface px-4 py-3 text-sm text-muted shadow-card sm:px-6">
            <summary className="font-medium text-fg">How the experiment works</summary>
            <ol className="mt-2 list-decimal space-y-1 pl-5">
              <li>
                Connect the adjustable DC supply, the ammeter and the resistor in series. Connect the voltmeter in
                parallel, directly across the two ends of the resistor (not across the supply).
              </li>
              <li>
                Before switching on, set the supply to 0 V and its current limit low (a few tens of mA), and start the
                ammeter on its highest range.
              </li>
              <li>
                Respect the resistor’s power rating: P = V · I = V² / R. A common 0.25 W resistor of 220 Ω allows at
                most about 7.4 V or 34 mA; stay well below that (for example under half the rating). A hot resistor
                changes its value — switch off before rewiring.
              </li>
              <li>Set several different voltages and write down the current for each one.</li>
              <li>
                Ohm’s law says V = I · R, so R = V / I should be the same every time and the points should lie on a
                straight line through zero.
              </li>
              <li>Compare the measured R with the value printed on the resistor, write a conclusion and save.</li>
            </ol>
          </details>

          <Section n={1} title="Experiment details">
            <div className="grid gap-4 sm:grid-cols-2">
              <Input
                label="Experiment title"
                name="title"
                containerClassName="sm:col-span-2"
                placeholder="e.g. Ohm's law — 220 Ω carbon resistor"
                value={exp.title}
                onChange={(event) => set('title', event.target.value)}
                error={show(detailErrors.title)}
              />
              <Input
                label="Course"
                name="course"
                placeholder="e.g. Electrical Measurements"
                value={exp.course}
                onChange={(event) => set('course', event.target.value)}
                error={show(detailErrors.course)}
              />
              <Input
                label="Date"
                name="date"
                type="date"
                value={exp.date}
                onChange={(event) => set('date', event.target.value)}
                error={show(detailErrors.date)}
              />
            </div>
          </Section>

          <Section n={2} title="Resistor under test">
            <div className="grid gap-4 sm:grid-cols-2">
              <Input
                label="Nominal resistance (Ω)"
                name="nominal"
                inputMode="decimal"
                autoComplete="off"
                placeholder="e.g. 220"
                value={exp.nominalOhms}
                onChange={(event) => set('nominalOhms', event.target.value)}
                error={show(errors.nominalOhms)}
                hint="The value from the colour code or the label."
              />
              <div className="flex flex-col gap-1.5">
                <label htmlFor="tolerance" className="text-sm font-medium text-fg">
                  Tolerance
                </label>
                <select
                  id="tolerance"
                  value={exp.tolerancePercent}
                  onChange={(event) => set('tolerancePercent', Number(event.target.value))}
                  className="h-10 rounded-md border border-line-strong bg-surface px-2.5 text-sm text-fg"
                >
                  {TOLERANCE_OPTIONS.map((value) => (
                    <option key={value} value={value}>
                      ± {value} %
                    </option>
                  ))}
                </select>
                <p className="text-xs text-muted">Gold band = ± 5 %, silver band = ± 10 %.</p>
              </div>
            </div>
          </Section>

          <Section n={3} title="Measurements">
            {matchesExample(exp) ? (
              <p data-testid="example-notice" className="mb-3 rounded-lg bg-warning-soft px-4 py-3 text-sm text-warning-ink">
                <strong className="font-semibold">Illustrative example data.</strong> These values are invented to
                demonstrate LabProof; they are not laboratory measurements. Replace them with your own readings before you
                use the report.
              </p>
            ) : null}
            <ReadingsTable
              rows={exp.readings}
              rowErrors={submitted ? errors.readings : []}
              onChange={(rows) => set('readings', rows)}
            />
            {submitted && errors.table ? (
              <p className="mt-3 text-sm font-medium text-danger-ink">{errors.table}</p>
            ) : null}
          </Section>

          <Section n={4} title="Results and graph">
            {result ? (
              <div className="grid items-start gap-6 lg:grid-cols-2">
                <div>
                  <ResultSummary result={result} />
                  <p className="mt-3 text-xs text-muted">
                    The best-fit slope combines all readings (least squares through the origin). It is not immune to
                    outliers: one wrong reading, especially at a high current, can shift it noticeably. Compare it with
                    the mean and check on the graph that every point lies close to the line.
                  </p>
                </div>
                <VIChart result={result} />
              </div>
            ) : (
              <p className="rounded-lg border border-dashed border-line-strong px-4 py-6 text-center text-sm text-muted">
                Enter the nominal resistance and at least three complete readings to see the result and the graph.
              </p>
            )}
          </Section>

          <Section n={5} title="Observations and conclusion">
            <div className="flex flex-col gap-4">
              <Textarea
                label="Observations (optional)"
                name="observations"
                rows={3}
                value={exp.observations}
                onChange={(event) => set('observations', event.target.value)}
                error={show(detailErrors.observations)}
                hint="For example: which meter and range you used, the room temperature, anything unusual."
                counter={`${charCount(exp.observations)}/${TEXT_LIMITS.observations}`}
              />
              <Textarea
                label="Conclusion (optional)"
                name="conclusion"
                rows={4}
                value={exp.conclusion}
                onChange={(event) => set('conclusion', event.target.value)}
                error={show(detailErrors.conclusion)}
                hint="In your own words: was Ohm’s law confirmed, and does the resistor meet its tolerance?"
                counter={`${charCount(exp.conclusion)}/${TEXT_LIMITS.conclusion}`}
              />
            </div>
          </Section>

          {saveError ? (
            <p role="alert" className="rounded-lg bg-danger-soft px-4 py-3 text-sm text-danger-ink">
              Could not save: {summarizeError(saveError).message} Your entries are still here, so you can try again.
            </p>
          ) : null}
          <div className="flex flex-wrap items-center gap-3">
            <Button
              type="submit"
              variant="primary"
              loading={saving}
              disabled={conflict}
              icon={<Save aria-hidden="true" className="size-4" />}
            >
              {saved ? 'Save changes' : 'Save experiment'}
            </Button>
            <Link to="/lab" className={buttonClasses('secondary')}>
              Cancel
            </Link>
            <span className="text-xs text-muted" aria-live="polite">
              {dirty ? 'Unsaved changes' : saved ? 'All changes saved' : ''}
            </span>
          </div>
        </div>
      </form>

      <ConfirmDialog
        open={blocker.state === 'blocked'}
        title="Discard unsaved changes?"
        description="You have changes that have not been saved. If you leave now they will be lost."
        confirmLabel="Discard changes"
        cancelLabel="Keep editing"
        destructive
        onConfirm={() => blocker.proceed?.()}
        onCancel={() => blocker.reset?.()}
      />
      <ConfirmDialog
        open={confirmDelete}
        title="Delete this experiment?"
        description={<>“{saved?.title}” and all its readings will be permanently deleted. This cannot be undone.</>}
        confirmLabel="Delete experiment"
        destructive
        busy={deleting}
        onConfirm={() => void remove()}
        onCancel={() => setConfirmDelete(false)}
      />
    </>
  )
}
