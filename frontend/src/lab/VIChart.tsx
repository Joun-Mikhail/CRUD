import { niceScale } from './chartScale'
import { formatOhms, type ExperimentResult } from './ohmsLaw'

const WIDTH = 360
const HEIGHT = 240
const PAD = { left: 44, right: 14, top: 26, bottom: 38 }
const PLOT_W = WIDTH - PAD.left - PAD.right
const PLOT_H = HEIGHT - PAD.top - PAD.bottom

const ticks = ({ max, step }: { max: number; step: number }) =>
  Array.from({ length: Math.round(max / step) + 1 }, (_, i) => Number((i * step).toPrecision(6)))

/**
 * Voltage V (y, volts) against current I (x, milliamperes). Ohm's law predicts a straight line
 * through the origin whose slope is the resistance, so the measured points (blue dots) should
 * sit on the best-fit line (violet, dashed). Plain SVG with Tailwind classes: no chart library
 * and no inline styles (the production Content-Security-Policy forbids them).
 */
export function VIChart({ result }: { result: ExperimentResult }) {
  const xScale = niceScale(Math.max(...result.readings.map((r) => r.currentMa)) * 1.05)
  const yScale = niceScale(Math.max(...result.readings.map((r) => r.voltage)) * 1.05)
  const x = (currentMa: number) => PAD.left + (currentMa / xScale.max) * PLOT_W
  const y = (voltage: number) => PAD.top + PLOT_H - (voltage / yScale.max) * PLOT_H

  // End the fit line where it leaves the plot area (top or right edge).
  const fitEndMa = Math.min(xScale.max, (yScale.max / result.fittedOhms) * 1000)
  const fitEndV = (result.fittedOhms * fitEndMa) / 1000

  return (
    <svg
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      role="img"
      aria-label={`Graph of voltage against current: ${result.readings.length} measured points and a best-fit line with slope ${formatOhms(result.fittedOhms)}.`}
      className="h-auto w-full max-w-md"
    >
      {/* grid + tick labels */}
      {ticks(yScale).map((v) => (
        <g key={`y${v}`}>
          <line x1={PAD.left} x2={PAD.left + PLOT_W} y1={y(v)} y2={y(v)} className="stroke-line" />
          <text x={PAD.left - 6} y={y(v) + 3} textAnchor="end" className="fill-muted text-[10px]">
            {v}
          </text>
        </g>
      ))}
      {ticks(xScale).map((i) => (
        <g key={`x${i}`}>
          <line x1={x(i)} x2={x(i)} y1={PAD.top} y2={PAD.top + PLOT_H} className="stroke-line" />
          <text x={x(i)} y={PAD.top + PLOT_H + 13} textAnchor="middle" className="fill-muted text-[10px]">
            {i}
          </text>
        </g>
      ))}
      {/* axes */}
      <line x1={PAD.left} y1={PAD.top} x2={PAD.left} y2={PAD.top + PLOT_H} className="stroke-faint" />
      <line x1={PAD.left} y1={PAD.top + PLOT_H} x2={PAD.left + PLOT_W} y2={PAD.top + PLOT_H} className="stroke-faint" />
      <text x={PAD.left + PLOT_W / 2} y={HEIGHT - 4} textAnchor="middle" className="fill-fg text-[11px] font-medium">
        Current I (mA)
      </text>
      <text
        x={11}
        y={PAD.top + PLOT_H / 2}
        textAnchor="middle"
        transform={`rotate(-90 11 ${PAD.top + PLOT_H / 2})`}
        className="fill-fg text-[11px] font-medium"
      >
        Voltage V (V)
      </text>

      {/* best-fit line V = R·I through the origin */}
      <line
        x1={x(0)}
        y1={y(0)}
        x2={x(fitEndMa)}
        y2={y(fitEndV)}
        strokeDasharray="5 4"
        strokeWidth={2}
        className="stroke-violet"
      />
      {result.readings.map((r, i) => (
        <circle key={i} cx={x(r.currentMa)} cy={y(r.voltage)} r={4.5} className="fill-accent stroke-surface" strokeWidth={1.5} />
      ))}

      {/* legend */}
      <g transform={`translate(${PAD.left + 4} 10)`}>
        <circle cx={4} cy={0} r={4} className="fill-accent" />
        <text x={12} y={3.5} className="fill-muted text-[10px]">
          measured
        </text>
        <line x1={70} x2={90} y1={0} y2={0} strokeDasharray="5 4" strokeWidth={2} className="stroke-violet" />
        <text x={95} y={3.5} className="fill-muted text-[10px]">
          best fit, R = {formatOhms(result.fittedOhms)}
        </text>
      </g>
    </svg>
  )
}
