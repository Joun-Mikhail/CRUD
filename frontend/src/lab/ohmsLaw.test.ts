import { describe, expect, it } from 'vitest'
import { niceScale } from './chartScale'
import {
  computeResult,
  evaluateExperiment,
  EXAMPLE_INPUT,
  formatOhms,
  formatPercent,
  OUT_OF_RANGE,
  parseDecimal,
} from './ohmsLaw'

const rows = (...pairs: [string, string][]) => pairs.map(([voltage, currentMa]) => ({ voltage, currentMa }))

describe('parseDecimal', () => {
  it('accepts a decimal point and a decimal comma', () => {
    expect(parseDecimal('1.5')).toBe(1.5)
    expect(parseDecimal(' 1,5 ')).toBe(1.5)
    expect(parseDecimal('.5')).toBe(0.5)
    expect(parseDecimal('220')).toBe(220)
  })

  it('rejects anything that is not a plain number', () => {
    for (const bad of ['', 'abc', '1.2.3', '1e3', '2 V', '0x10']) expect(parseDecimal(bad)).toBeNaN()
  })

  it('rejects Infinity, NaN and numbers too large for JavaScript (regression)', () => {
    const overflow = '9'.repeat(400) // a valid-looking decimal that Number() turns into Infinity
    for (const bad of ['Infinity', '-Infinity', 'NaN', overflow, `-${overflow}`, `${overflow},5`]) {
      expect(parseDecimal(bad)).toBeNaN()
    }
  })
})

describe('evaluateExperiment', () => {
  it('computes R = V / I for every reading (current in mA)', () => {
    const { result } = evaluateExperiment({
      nominalOhms: '100',
      tolerancePercent: 5,
      readings: rows(['1', '10'], ['2', '20'], ['3', '30']),
    })
    expect(result?.readings.map((r) => r.resistance)).toEqual([100, 100, 100])
    expect(result?.meanOhms).toBeCloseTo(100)
    expect(result?.fittedOhms).toBeCloseTo(100)
    expect(result?.deviationPercent).toBeCloseTo(0)
    expect(result?.withinTolerance).toBe(true)
  })

  it('passes the built-in example (220 Ω, ± 5 %)', () => {
    const { result } = evaluateExperiment(EXAMPLE_INPUT)
    expect(result?.fittedOhms).toBeCloseTo(220.4, 1)
    expect(result?.withinTolerance).toBe(true)
  })

  it('flags a resistor outside its tolerance', () => {
    const { result } = evaluateExperiment({
      nominalOhms: '100',
      tolerancePercent: 5,
      readings: rows(['1', '9'], ['2', '18'], ['3', '27']), // ≈ 111 Ω, +11 %
    })
    expect(result?.deviationPercent).toBeCloseTo(11.1, 1)
    expect(result?.withinTolerance).toBe(false)
  })

  it('ignores completely empty rows', () => {
    const { result } = evaluateExperiment({
      nominalOhms: '100',
      tolerancePercent: 5,
      readings: rows(['1', '10'], ['', ''], ['2', '20'], ['3', '30'], ['  ', '']),
    })
    expect(result?.readings).toHaveLength(3)
  })

  it('requires at least three readings', () => {
    const { errors, result } = evaluateExperiment({
      nominalOhms: '100',
      tolerancePercent: 5,
      readings: rows(['1', '10'], ['2', '20']),
    })
    expect(result).toBeNull()
    expect(errors.table).toMatch(/at least 3 readings/)
  })

  it('rejects a missing or non-positive nominal value', () => {
    const base = { tolerancePercent: 5, readings: rows(['1', '10'], ['2', '20'], ['3', '30']) }
    expect(evaluateExperiment({ ...base, nominalOhms: '' }).errors.nominalOhms).toMatch(/printed value/)
    expect(evaluateExperiment({ ...base, nominalOhms: '0' }).errors.nominalOhms).toMatch(/above 0/)
    expect(evaluateExperiment({ ...base, nominalOhms: 'ten' }).result).toBeNull()
  })

  it('reports the exact row that is wrong, including a zero current (division by zero)', () => {
    const { errors, result } = evaluateExperiment({
      nominalOhms: '100',
      tolerancePercent: 5,
      readings: rows(['1', '10'], ['2', '0'], ['x', '30'], ['4', '40']),
    })
    expect(result).toBeNull()
    expect(errors.readings).toEqual([
      undefined,
      'Current must be a number above 0.',
      'Voltage must be a number above 0.',
      undefined,
    ])
  })
})

describe('evaluateExperiment never produces non-finite numbers (regression)', () => {
  const finite = (r: NonNullable<ReturnType<typeof evaluateExperiment>['result']>) =>
    [r.meanOhms, r.fittedOhms, r.sumVI, r.sumII, r.deviationPercent, ...r.readings.map((x) => x.resistance)].every(
      Number.isFinite,
    )

  it('rejects an overflowing voltage or nominal value as an invalid number', () => {
    const huge = '9'.repeat(400)
    const { errors, result } = evaluateExperiment({
      nominalOhms: huge,
      tolerancePercent: 5,
      readings: rows([huge, '1'], ['2', '2'], ['3', '3']),
    })
    expect(result).toBeNull()
    expect(errors.nominalOhms).toBe('The nominal resistance must be a number above 0.')
    expect(errors.readings[0]).toBe('Voltage must be a number above 0.')
  })

  it('rejects a reading whose resistance would overflow (huge V over a tiny I)', () => {
    const { errors, result } = evaluateExperiment({
      nominalOhms: '100',
      tolerancePercent: 5,
      readings: rows([`1${'0'.repeat(300)}`, `0.${'0'.repeat(20)}1`], ['2', '20'], ['3', '30']),
    })
    expect(result).toBeNull()
    expect(errors.readings[0]).toBe(OUT_OF_RANGE)
  })

  it('rejects readings whose sums underflow, instead of dividing by zero', () => {
    const tiny = `0.${'0'.repeat(199)}1` // I² underflows to 0 in floating point
    const { errors, result } = evaluateExperiment({
      nominalOhms: '100',
      tolerancePercent: 5,
      readings: rows([`0.${'0'.repeat(199)}1`, tiny], [`0.${'0'.repeat(199)}2`, tiny], [`0.${'0'.repeat(199)}3`, tiny]),
    })
    expect(result).toBeNull()
    expect(errors.table).toBe(OUT_OF_RANGE)
  })

  it('keeps every value finite for ordinary and extreme-but-valid readings', () => {
    const ordinary = evaluateExperiment(EXAMPLE_INPUT).result
    const extreme = evaluateExperiment({
      nominalOhms: '0.001',
      tolerancePercent: 10,
      readings: rows(['0.000001', '1000'], ['0.000002', '2000'], ['0.000003', '3000']),
    }).result
    expect(ordinary && finite(ordinary)).toBe(true)
    expect(extreme && finite(extreme)).toBe(true)
  })
})

describe('computeResult', () => {
  it('uses the least-squares slope through the origin, which differs from the plain mean', () => {
    // R values 100 and 200; the high-current reading dominates the fit.
    const result = computeResult(150, 10, [
      { voltage: 1, currentMa: 10, resistance: 100 },
      { voltage: 4, currentMa: 20, resistance: 200 },
    ])
    expect(result.meanOhms).toBeCloseTo(150)
    // Σ(V·I)/Σ(I²) = (0.01 + 0.08) / (0.0001 + 0.0004) = 180
    expect(result.sumVI).toBeCloseTo(0.09)
    expect(result.sumII).toBeCloseTo(0.0005)
    expect(result.fittedOhms).toBeCloseTo(180)
    expect(result.withinTolerance).toBe(false)
  })
})

describe('formatting', () => {
  it('formats resistance with SI prefixes and three significant digits', () => {
    expect(formatOhms(220.43)).toBe('220 Ω')
    expect(formatOhms(4.7)).toBe('4.7 Ω')
    expect(formatOhms(1470)).toBe('1.47 kΩ')
    expect(formatOhms(2_200_000)).toBe('2.2 MΩ')
  })

  it('formats a signed percentage', () => {
    expect(formatPercent(0.196)).toBe('+0.2 %')
    expect(formatPercent(-3.04)).toBe('−3.0 %')
    expect(formatPercent(0.01)).toBe('0.0 %')
    expect(formatPercent(-0.04)).toBe('0.0 %')
  })
})

describe('niceScale (graph axes)', () => {
  it('rounds the axis end up to 1, 2, 2.5 or 5 × 10ⁿ', () => {
    expect(niceScale(23.7)).toEqual({ max: 25, step: 5 })
    expect(niceScale(5.25)).toEqual({ max: 10, step: 2.5 })
    expect(niceScale(4)).toEqual({ max: 5, step: 1 })
    expect(niceScale(0.9)).toEqual({ max: 1, step: 0.25 })
  })
})
