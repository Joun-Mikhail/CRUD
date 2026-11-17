import { Badge } from '../components/ui/Badge'
import { formatOhms, formatPercent, type ExperimentResult } from './ohmsLaw'

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-line bg-canvas p-3 print:border-line-strong">
      <dt className="text-xs font-medium text-muted">{label}</dt>
      <dd className="mt-0.5 text-lg font-semibold tracking-tight text-fg tabular-nums">{value}</dd>
    </div>
  )
}

/**
 * The four key numbers and the PASS / CHECK verdict. Used by the editor and the report.
 * PASS means only |R_fit − R_nom| / R_nom ≤ tolerance; it is not a proof of Ohm's law.
 */
export function ResultSummary({ result }: { result: ExperimentResult }) {
  return (
    <div>
      <dl className="grid grid-cols-2 gap-3">
        <Stat label="Mean of V / I" value={formatOhms(result.meanOhms)} />
        <Stat label="Best-fit slope" value={formatOhms(result.fittedOhms)} />
        <Stat label="Nominal value" value={`${formatOhms(result.nominalOhms)} ± ${result.tolerancePercent} %`} />
        <Stat label="Deviation" value={formatPercent(result.deviationPercent)} />
      </dl>
      <p data-testid="lab-verdict" className="mt-4 flex flex-wrap items-center gap-2 text-sm text-fg" aria-live="polite">
        {result.withinTolerance ? (
          <>
            <Badge tone="success">PASS</Badge>
            The best-fit resistance is within ± {result.tolerancePercent} % of the nominal value.
          </>
        ) : (
          <>
            <Badge tone="warning">CHECK</Badge>
            The best-fit resistance is outside ± {result.tolerancePercent} % of the nominal value — check the wiring,
            the meter range and the colour code.
          </>
        )}
      </p>
      <p className="mt-2 text-xs text-muted">
        The verdict only compares the resistance value with the tolerance. Whether the resistor obeys Ohm’s law is judged
        from the graph: the points should lie close to a straight line through the origin.
      </p>
    </div>
  )
}
