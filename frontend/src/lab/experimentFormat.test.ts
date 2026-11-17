import { describe, expect, it } from 'vitest'
import { makeNote } from '../test/helpers'
import { validateNote } from '../utils/noteValidation'
import {
  emptyExperiment,
  FORMAT,
  formatLabDate,
  fromNote,
  isExperimentNote,
  TEXT_LIMITS,
  todayIso,
  toNoteInput,
  validateDetails,
  type LabExperiment,
} from './experimentFormat'

const EXPERIMENT: LabExperiment = {
  title: "Ohm's law — 220 Ω resistor",
  course: 'Electrical Measurements',
  date: '2026-11-17',
  nominalOhms: '220',
  tolerancePercent: 5,
  readings: [
    { voltage: '1,0', currentMa: '4.6' },
    { voltage: '', currentMa: '' }, // empty rows are dropped on save
    { voltage: '2', currentMa: '9.1' },
    { voltage: '3', currentMa: '13.5' },
  ],
  observations: '  Meter on the 20 mA range.  ',
  conclusion: 'Ohm’s law holds; the resistor is within tolerance.',
}

describe('toNoteInput / fromNote (save and reopen)', () => {
  it('stores the inputs as versioned JSON and restores every field', () => {
    const input = toNoteInput(EXPERIMENT)
    expect(input).not.toBeNull()
    if (!input) return
    expect(input.title).toBe(EXPERIMENT.title)
    const stored = JSON.parse(input.content) as Record<string, unknown>
    expect(stored).toMatchObject({ format: FORMAT, formatVersion: 1, nominalOhms: 220, tolerancePercent: 5 })
    expect(stored.readings).toEqual([
      { voltageV: 1, currentMa: 4.6 },
      { voltageV: 2, currentMa: 9.1 },
      { voltageV: 3, currentMa: 13.5 },
    ])
    // Calculated values are never stored; they are recomputed from the readings.
    expect(input.content).not.toMatch(/fitted|mean|deviation/i)

    const reopened = fromNote({ title: input.title, content: input.content })
    expect(reopened).toEqual({
      ...EXPERIMENT,
      readings: [
        { voltage: '1', currentMa: '4.6' },
        { voltage: '2', currentMa: '9.1' },
        { voltage: '3', currentMa: '13.5' },
      ],
      observations: 'Meter on the 20 mA range.',
    })
    expect(validateNote(input.title, input.content)).toEqual({})
  })

  it('refuses to serialise invalid measurements', () => {
    expect(toNoteInput({ ...EXPERIMENT, readings: [{ voltage: '1', currentMa: '0' }] })).toBeNull()
  })

  it('fits the largest allowed experiment inside the 20 000-character note limit', () => {
    const big: LabExperiment = {
      ...EXPERIMENT,
      readings: Array.from({ length: 10 }, (_, i) => ({ voltage: `${i + 1}.123456`, currentMa: `${i + 1}.654321` })),
      observations: '"'.repeat(TEXT_LIMITS.observations), // every quote is escaped as \" in JSON
      conclusion: '"'.repeat(TEXT_LIMITS.conclusion),
    }
    const input = toNoteInput(big)
    expect(input && validateNote(input.title, input.content)).toEqual({})
  })
})

describe('fromNote keeps old and foreign notes compatible', () => {
  it.each([
    ['plain text', 'Shopping list: milk'],
    ['empty', ''],
    ['other JSON', '{"hello": "world"}'],
    ['broken JSON', '{"format": "labproof/ohms-law", '],
    ['newer version', JSON.stringify({ format: FORMAT, formatVersion: 2 })],
    ['JSON array', '[1, 2, 3]'],
  ])('treats %s as an ordinary note', (_, content) => {
    expect(fromNote(makeNote({ content }))).toBeNull()
    expect(isExperimentNote(makeNote({ content }))).toBe(false)
  })

  it('rejects stored data with impossible values (e.g. zero current)', () => {
    const input = toNoteInput(EXPERIMENT)
    if (!input) throw new Error('expected a valid input')
    const stored = JSON.parse(input.content) as { readings: { currentMa: number }[]; tolerancePercent: number }
    const first = stored.readings[0]
    if (first) first.currentMa = 0
    expect(fromNote({ title: 't', content: JSON.stringify(stored) })).toBeNull()
    const badTolerance = { ...JSON.parse(input.content), tolerancePercent: 3 }
    expect(fromNote({ title: 't', content: JSON.stringify(badTolerance) })).toBeNull()
  })
})

describe('validateDetails', () => {
  it('requires a title, a course and a date', () => {
    expect(validateDetails(emptyExperiment(''))).toEqual({
      title: 'Enter an experiment title.',
      course: 'Enter the course name.',
      date: 'Enter the date of the experiment.',
    })
    expect(validateDetails(EXPERIMENT)).toEqual({})
  })

  it('applies the note title rules and the text limits', () => {
    const errors = validateDetails({
      ...EXPERIMENT,
      title: 'x'.repeat(201),
      course: 'c'.repeat(TEXT_LIMITS.course + 1),
      conclusion: 'c'.repeat(TEXT_LIMITS.conclusion + 1),
    })
    expect(errors.title).toMatch(/at most 200/)
    expect(errors.course).toMatch(/at most 100/)
    expect(errors.conclusion).toMatch(/At most 4,000/)
  })
})

describe('dates', () => {
  it('formats today as YYYY-MM-DD in local time', () => {
    expect(todayIso(new Date(2026, 0, 5))).toBe('2026-01-05')
  })

  it('shows a stored date without shifting it by the time zone', () => {
    expect(formatLabDate('2026-11-17')).toContain('17')
    expect(formatLabDate('not a date')).toBe('not a date')
  })
})
