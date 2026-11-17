/**
 * LabProof Lite — the Ohm's law experiment, as plain functions.
 *
 * Ohm's law: V = I · R. In the experiment the student applies several voltages V to one
 * resistor, measures the current I each time, and checks that V/I stays (roughly) constant
 * and equals the resistor's printed (nominal) value within its tolerance.
 *
 * Nothing here talks to React or the API, so every rule can be unit-tested on its own.
 */

/** One row of the measurement table as typed by the student (raw text). */
export interface ReadingInput {
  voltage: string
  /** Milliamperes, because that is what a bench multimeter shows for small resistors. */
  currentMa: string
}

/** A parsed, valid reading in SI-friendly units. */
export interface Reading {
  voltage: number
  currentMa: number
  /** V / I for this single row, in ohms. */
  resistance: number
}

export interface ExperimentInput {
  nominalOhms: string
  tolerancePercent: number
  readings: ReadingInput[]
}

export interface ExperimentResult {
  nominalOhms: number
  tolerancePercent: number
  readings: Reading[]
  /** Average of the per-row V/I values. */
  meanOhms: number
  /** Least-squares slope of V over I through the origin: the "line of best fit" value. */
  fittedOhms: number
  /** Σ(V·I) and Σ(I²) with I in amperes; shown in the report so the fit can be checked by hand. */
  sumVI: number
  sumII: number
  /** (fitted − nominal) / nominal, in percent. Positive means the resistor measured high. */
  deviationPercent: number
  /** True when |deviation| ≤ tolerance. */
  withinTolerance: boolean
}

export interface ExperimentErrors {
  nominalOhms?: string
  /** Error per reading row (same index as the input); `undefined` means the row is fine. */
  readings: (string | undefined)[]
  /** Error about the table as a whole (e.g. too few rows). */
  table?: string
}

export const MIN_READINGS = 3
export const MAX_READINGS = 10
export const TOLERANCE_OPTIONS = [1, 2, 5, 10] as const

/** Accepts "1.5" and the Czech/German style "1,5". Returns NaN for anything else. */
export function parseDecimal(raw: string): number {
  const text = raw.trim().replace(',', '.')
  if (!/^[+-]?(\d+\.?\d*|\.\d+)$/.test(text)) return Number.NaN
  return Number(text)
}

function isBlank(row: ReadingInput): boolean {
  return row.voltage.trim() === '' && row.currentMa.trim() === ''
}

/**
 * Checks the form and, when everything is valid, computes the result.
 * Completely empty rows are ignored, so the student can leave spare rows blank.
 */
export function evaluateExperiment(input: ExperimentInput): {
  errors: ExperimentErrors
  result: ExperimentResult | null
} {
  const errors: ExperimentErrors = { readings: input.readings.map(() => undefined) }

  const nominalOhms = parseDecimal(input.nominalOhms)
  if (input.nominalOhms.trim() === '') errors.nominalOhms = 'Enter the resistor’s printed value.'
  else if (!(nominalOhms > 0)) errors.nominalOhms = 'The nominal resistance must be a number above 0.'

  const readings: Reading[] = []
  input.readings.forEach((row, index) => {
    if (isBlank(row)) return
    const voltage = parseDecimal(row.voltage)
    const currentMa = parseDecimal(row.currentMa)
    if (!(voltage > 0)) {
      errors.readings[index] = 'Voltage must be a number above 0.'
    } else if (!(currentMa > 0)) {
      // A current of 0 would mean dividing by zero when computing R = V / I.
      errors.readings[index] = 'Current must be a number above 0.'
    } else {
      readings.push({ voltage, currentMa, resistance: voltage / (currentMa / 1000) })
    }
  })

  const rowErrors = errors.readings.some(Boolean)
  if (!rowErrors && readings.length < MIN_READINGS) {
    errors.table = `Enter at least ${MIN_READINGS} readings. One measurement cannot show that V/I is constant.`
  }

  if (errors.nominalOhms || rowErrors || errors.table) return { errors, result: null }
  return { errors, result: computeResult(nominalOhms, input.tolerancePercent, readings) }
}

export function computeResult(nominalOhms: number, tolerancePercent: number, readings: Reading[]): ExperimentResult {
  const meanOhms = readings.reduce((sum, r) => sum + r.resistance, 0) / readings.length
  // Best-fit line V = R·I through (0, 0): R = Σ(V·I) / Σ(I²). Currents in amperes.
  let sumVI = 0
  let sumII = 0
  for (const r of readings) {
    const amps = r.currentMa / 1000
    sumVI += r.voltage * amps
    sumII += amps * amps
  }
  const fittedOhms = sumVI / sumII
  const deviationPercent = ((fittedOhms - nominalOhms) / nominalOhms) * 100
  return {
    nominalOhms,
    tolerancePercent,
    readings,
    meanOhms,
    fittedOhms,
    sumVI,
    sumII,
    deviationPercent,
    withinTolerance: Math.abs(deviationPercent) <= tolerancePercent,
  }
}

/** "220 Ω", "1.47 kΩ" — at most three significant digits, as on a lab report. */
export function formatOhms(ohms: number): string {
  if (ohms >= 1_000_000) return `${sig3(ohms / 1_000_000)} MΩ`
  if (ohms >= 1000) return `${sig3(ohms / 1000)} kΩ`
  return `${sig3(ohms)} Ω`
}

/** Three significant digits, without trailing zeros. */
export function sig3(value: number): string {
  return Number(value.toPrecision(3)).toString()
}

export function formatPercent(value: number): string {
  const rounded = Math.round(value * 10) / 10
  const sign = rounded > 0 ? '+' : rounded < 0 ? '−' : '±'
  return `${sign}${Math.abs(rounded).toFixed(1)} %`
}

/** Ready-made readings for a 220 Ω resistor, so the workflow can be shown in seconds. */
export const EXAMPLE_INPUT: ExperimentInput = {
  nominalOhms: '220',
  tolerancePercent: 5,
  readings: [
    { voltage: '1.0', currentMa: '4.6' },
    { voltage: '2.0', currentMa: '9.1' },
    { voltage: '3.0', currentMa: '13.5' },
    { voltage: '4.0', currentMa: '18.3' },
    { voltage: '5.0', currentMa: '22.6' },
  ],
}
