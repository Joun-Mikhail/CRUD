import { ArrowLeft, Printer } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Link, useParams } from 'react-router'
import { Button } from '../../components/ui/Button'
import { buttonClasses } from '../../components/ui/buttonStyles'
import { ErrorState } from '../../components/ui/ErrorState'
import { Skeleton } from '../../components/ui/Skeleton'
import { useAuth } from '../../hooks/useAuth'
import { useDocumentTitle } from '../../hooks/useDocumentTitle'
import { formatLabDate } from '../../lab/experimentFormat'
import { evaluateExperiment, formatOhms, formatPercent, matchesExample, sig3 } from '../../lab/ohmsLaw'
import { ResultSummary } from '../../lab/ResultSummary'
import { useExperimentNote } from '../../lab/useExperimentNote'
import { VIChart } from '../../lab/VIChart'
import { formatDateTime } from '../../utils/format'

function ReportSection({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <section className="mt-7">
      <h2 className="mb-2 border-b border-line pb-1 text-base font-semibold text-fg break-after-avoid">
        {n}. {title}
      </h2>
      {children}
    </section>
  )
}

const num = (value: number, digits = 4) => Number(value.toPrecision(digits)).toString()

/**
 * /lab/:noteId/report — a print-friendly laboratory report. "Print / Save as PDF" calls the
 * browser's own print dialog; print CSS hides the app navigation, so only the report is printed.
 */
export function LabReportPage() {
  const { noteId } = useParams()
  const load = useExperimentNote(noteId)
  const { user } = useAuth()
  /** Missing parts shown before printing; null when no warning is open. */
  const [missing, setMissing] = useState<string[] | null>(null)
  useDocumentTitle(load.status === 'ready' ? `Lab report — ${load.note.title}` : 'Lab report')

  const back = (
    <Link to={noteId ? `/lab/${noteId}` : '/lab'} className={buttonClasses('ghost', 'sm', '-ml-2')}>
      <ArrowLeft aria-hidden="true" className="size-4" />
      Back to the experiment
    </Link>
  )

  if (load.status === 'loading') {
    return (
      <div role="status" aria-label="Loading report" className="flex flex-col gap-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-96" />
      </div>
    )
  }
  if (load.status === 'error') return <ErrorState error={load.error} />
  if (load.status === 'not-experiment') {
    return <ErrorState error={null} title="This note is not a LabProof experiment" />
  }

  const { note, experiment } = load
  const result = evaluateExperiment(experiment).result
  if (!result) return <ErrorState error={null} title="The stored readings could not be evaluated" />
  const first = result.readings[0]
  const isExample = matchesExample(experiment)

  /** Prints straight away when the report is complete; otherwise first says what is missing. */
  function requestPrint() {
    const gaps = [
      experiment.observations.trim() ? null : 'observations',
      experiment.conclusion.trim() ? null : 'conclusion',
    ].filter((gap): gap is string => gap !== null)
    if (gaps.length === 0) window.print()
    else setMissing(gaps)
  }

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 print:hidden">
        {back}
        <Button variant="primary" icon={<Printer aria-hidden="true" className="size-4" />} onClick={requestPrint}>
          Print / Save as PDF
        </Button>
      </div>
      {missing ? (
        <div role="alert" className="mb-4 rounded-lg bg-warning-soft p-4 text-sm text-warning-ink print:hidden">
          <p className="font-medium">This report has no {missing.join(' or ')} yet.</p>
          <p className="mt-1">
            You can print it anyway, or go back to the experiment and write {missing.length > 1 ? 'them' : 'it'} in your
            own words first. LabProof never writes conclusions for you.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              size="sm"
              onClick={() => {
                setMissing(null)
                window.print()
              }}
            >
              Print anyway
            </Button>
            <Link to={`/lab/${note.noteId}`} className={buttonClasses('secondary', 'sm')}>
              Back to the experiment
            </Link>
          </div>
        </div>
      ) : null}
      <p className="mb-4 text-xs text-muted print:hidden">
        Tip: in the print dialog choose “Save as PDF” as the destination. Turn off “Headers and footers” for a cleaner
        page.
      </p>

      <article
        aria-label="Laboratory report"
        className="mx-auto max-w-3xl rounded-xl border border-line bg-surface p-6 text-sm leading-relaxed text-fg shadow-card sm:p-10 print:max-w-none print:rounded-none print:border-0 print:p-0 print:shadow-none"
      >
        <header className="border-b-2 border-accent pb-4">
          <p className="text-xs font-semibold tracking-widest text-accent-ink uppercase">LabProof Lite · Laboratory report</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">{note.title}</h1>
          <dl className="mt-3 grid gap-x-6 gap-y-1 sm:grid-cols-2 print:grid-cols-2">
            {[
              ['Course', experiment.course],
              ['Date', formatLabDate(experiment.date)],
              ['Student', user?.displayName ?? '—'],
              ['Resistor under test', `${formatOhms(result.nominalOhms)} ± ${result.tolerancePercent} %`],
            ].map(([label, value]) => (
              <div key={label} className="flex gap-2">
                <dt className="text-muted">{label}:</dt>
                <dd className="font-medium">{value}</dd>
              </div>
            ))}
          </dl>
        </header>

        {isExample ? (
          <p
            data-testid="report-example-notice"
            className="mt-4 rounded-md border border-warning-ink/40 bg-warning-soft px-3 py-2 text-xs text-warning-ink"
          >
            <strong>Illustrative data:</strong> the measurements below are LabProof’s built-in example values, not
            laboratory measurements.
          </p>
        ) : null}

        <ReportSection n={1} title="Aim">
          <p>
            To verify Ohm’s law, V = I · R, for one resistor and to check whether its measured resistance agrees with
            the nominal value within the stated tolerance.
          </p>
        </ReportSection>

        <ReportSection n={2} title="Method (standard procedure)">
          <p>
            The standard procedure for this experiment: an adjustable DC supply, an ammeter and the resistor are
            connected in series, and a voltmeter is connected in parallel directly across the resistor. Several voltages
            V are applied, keeping the power V · I below the resistor’s rating, and the current I is read from the
            ammeter. For each reading the resistance is calculated as R = V / I, with the current converted from
            milliamperes to amperes: R = V / (I<sub>mA</sub> / 1000).
          </p>
          <p className="mt-2">
            LabProof does not record how the measurements were actually taken. Any deviation from this procedure belongs
            in the observations.
          </p>
        </ReportSection>

        <ReportSection n={3} title="Measurements">
          <table className="w-full break-inside-avoid border-collapse text-right tabular-nums">
            <caption className="mb-1 text-left text-xs text-muted">Table 1: Measured values and calculated resistance. R = V / I, with the current converted from milliamperes to amperes: I (A) = I (mA) / 1000.</caption>
            <thead>
              <tr className="border-y border-line-strong bg-subtle text-xs">
                <th scope="col" className="px-2 py-1.5 text-left font-semibold">#</th>
                <th scope="col" className="px-2 py-1.5 font-semibold">V (V)</th>
                <th scope="col" className="px-2 py-1.5 font-semibold">I (mA)</th>
                <th scope="col" className="px-2 py-1.5 font-semibold">I (A)</th>
                <th scope="col" className="px-2 py-1.5 font-semibold">Resistance R (Ω)</th>
              </tr>
            </thead>
            <tbody>
              {result.readings.map((r, i) => (
                <tr key={i} className="border-b border-line">
                  <td className="px-2 py-1 text-left">{i + 1}</td>
                  <td className="px-2 py-1">{r.voltage}</td>
                  <td className="px-2 py-1">{r.currentMa}</td>
                  <td className="px-2 py-1">{num(r.currentMa / 1000)}</td>
                  <td className="px-2 py-1 font-medium">{sig3(r.resistance)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </ReportSection>

        <ReportSection n={4} title="Calculations">
          <ul className="space-y-2" data-testid="report-calculations">
            {first ? (
              <li>
                <span className="font-medium">Single reading (row 1):</span> R₁ = V₁ / (I₁ / 1000) = {first.voltage} V
                / ({first.currentMa} mA / 1000) = <strong>{formatOhms(first.resistance)}</strong>
              </li>
            ) : null}
            <li>
              <span className="font-medium">Mean of all readings:</span> R̄ = (1/n) · Σ Rᵢ, with n = {result.readings.length}{' '}
              → <strong>{formatOhms(result.meanOhms)}</strong>
            </li>
            <li>
              <span className="font-medium">Best-fit line through the origin (least squares):</span> R<sub>fit</sub> =
              Σ(Vᵢ · Iᵢ) / Σ(Iᵢ²) = {num(result.sumVI)} V·A / {num(result.sumII)} A² ={' '}
              <strong>{formatOhms(result.fittedOhms)}</strong>
            </li>
            <li>
              <span className="font-medium">Deviation from nominal:</span> δ = (R<sub>fit</sub> − R<sub>nom</sub>) /
              R<sub>nom</sub> · 100 % = ({num(result.fittedOhms)} − {num(result.nominalOhms)}) /{' '}
              {num(result.nominalOhms)} · 100 % = <strong>{formatPercent(result.deviationPercent)}</strong>
            </li>
          </ul>
          <div className="mt-4 break-inside-avoid">
            <ResultSummary result={result} />
          </div>
        </ReportSection>

        <ReportSection n={5} title="Graph">
          <figure className="flex break-inside-avoid flex-col items-center">
            <VIChart result={result} />
            <figcaption className="mt-1 text-xs text-muted">
              Figure 1: Voltage against current. Dots are the measurements; the dashed line is the best fit V = R
              <sub>fit</sub> · I with R<sub>fit</sub> = {formatOhms(result.fittedOhms)}.
            </figcaption>
          </figure>
        </ReportSection>

        <ReportSection n={6} title="Observations">
          <p className="whitespace-pre-wrap">{experiment.observations || 'No observations were recorded.'}</p>
        </ReportSection>

        <ReportSection n={7} title="Conclusion">
          <p className="whitespace-pre-wrap">{experiment.conclusion || 'No conclusion has been written yet.'}</p>
        </ReportSection>

        <footer className="mt-8 border-t border-line pt-3 text-xs text-muted">
          The measured values, observations and conclusion were entered by the student, who is responsible for them;
          LabProof only calculates R, the mean, the best fit and the deviation, and does not write conclusions.
          Generated with LabProof Lite (engineering lab module of Serverless Notes) from saved record {note.noteId} (version {note.version}, last updated{' '}
          {formatDateTime(note.updatedAt)}). Calculated values are recomputed from the stored readings.
        </footer>
      </article>
    </>
  )
}
