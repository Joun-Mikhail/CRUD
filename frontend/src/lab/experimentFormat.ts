/**
 * How a LabProof experiment is stored inside an ordinary note.
 *
 *   note.title   = the experiment title
 *   note.content = a small JSON document (FORMAT + FORMAT_VERSION + the student's inputs)
 *
 * Only the inputs are stored. Every calculated value (R per row, mean, best fit, deviation)
 * is recomputed from them when the experiment is opened, so stored data can never disagree
 * with the formulas. Notes without this JSON are ordinary notes and are left untouched.
 */
import type { Note } from '../types/api'
import { charCount, validateNote } from '../utils/noteValidation'
import { evaluateExperiment, MAX_READINGS, TOLERANCE_OPTIONS, type ReadingInput } from './ohmsLaw'

export const FORMAT = 'labproof/ohms-law'
export const FORMAT_VERSION = 1

export const TEXT_LIMITS = { course: 100, observations: 4000, conclusion: 4000 } as const

/** The editor's form state: everything as the student typed it (strings). */
export interface LabExperiment {
  title: string
  course: string
  /** YYYY-MM-DD, as produced by <input type="date">. */
  date: string
  nominalOhms: string
  tolerancePercent: number
  readings: ReadingInput[]
  observations: string
  conclusion: string
}

/** What is written to note.content (version 1). Numbers are stored as numbers. */
interface StoredExperimentV1 {
  format: typeof FORMAT
  formatVersion: 1
  course: string
  date: string
  nominalOhms: number
  tolerancePercent: number
  readings: { voltageV: number; currentMa: number }[]
  observations: string
  conclusion: string
}

export function emptyExperiment(today: string): LabExperiment {
  return {
    title: '',
    course: '',
    date: today,
    nominalOhms: '',
    tolerancePercent: 5,
    readings: Array.from({ length: 3 }, () => ({ voltage: '', currentMa: '' })),
    observations: '',
    conclusion: '',
  }
}

/** Today's date in the browser's time zone, as YYYY-MM-DD. */
export function todayIso(now: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

export interface DetailErrors {
  title?: string
  course?: string
  date?: string
  observations?: string
  conclusion?: string
}

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

/** Checks the descriptive fields. The measurements are checked by evaluateExperiment(). */
export function validateDetails(exp: LabExperiment): DetailErrors {
  const errors: DetailErrors = {}
  const titleError = validateNote(exp.title, '').title
  if (titleError) errors.title = titleError === 'Enter a title.' ? 'Enter an experiment title.' : titleError
  if (!exp.course.trim()) errors.course = 'Enter the course name.'
  else if (charCount(exp.course.trim()) > TEXT_LIMITS.course) {
    errors.course = `The course name must be at most ${TEXT_LIMITS.course} characters.`
  }
  if (!DATE_PATTERN.test(exp.date) || Number.isNaN(Date.parse(exp.date))) errors.date = 'Enter the date of the experiment.'
  for (const field of ['observations', 'conclusion'] as const) {
    if (charCount(exp[field]) > TEXT_LIMITS[field]) {
      errors[field] = `At most ${TEXT_LIMITS[field].toLocaleString('en-US')} characters.`
    }
  }
  return errors
}

/**
 * Converts a valid experiment into the note fields sent to POST/PUT /notes.
 * Returns null when the measurements are not valid (the caller shows the form errors).
 */
export function toNoteInput(exp: LabExperiment): { title: string; content: string } | null {
  const { result } = evaluateExperiment(exp)
  if (!result) return null
  const stored: StoredExperimentV1 = {
    format: FORMAT,
    formatVersion: FORMAT_VERSION,
    course: exp.course.trim(),
    date: exp.date,
    nominalOhms: result.nominalOhms,
    tolerancePercent: result.tolerancePercent,
    readings: result.readings.map((r) => ({ voltageV: r.voltage, currentMa: r.currentMa })),
    observations: exp.observations.trim(),
    conclusion: exp.conclusion.trim(),
  }
  return { title: exp.title.trim(), content: JSON.stringify(stored, null, 2) }
}

const isString = (value: unknown): value is string => typeof value === 'string'
const isPositive = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0

/**
 * Reads an experiment back from a note. Returns null for ordinary notes, other formats,
 * newer format versions and damaged JSON, so such notes are simply treated as text.
 */
export function fromNote(note: Pick<Note, 'title' | 'content'>): LabExperiment | null {
  if (!note.content.trimStart().startsWith('{')) return null
  let data: unknown
  try {
    data = JSON.parse(note.content)
  } catch {
    return null
  }
  if (typeof data !== 'object' || data === null) return null
  const d = data as Record<string, unknown>
  if (d.format !== FORMAT || d.formatVersion !== FORMAT_VERSION) return null
  if (!isString(d.course) || !isString(d.date) || !isString(d.observations) || !isString(d.conclusion)) return null
  if (!isPositive(d.nominalOhms) || !TOLERANCE_OPTIONS.some((t) => t === d.tolerancePercent)) return null
  if (!Array.isArray(d.readings) || d.readings.length === 0 || d.readings.length > MAX_READINGS) return null
  const readings: ReadingInput[] = []
  for (const row of d.readings as unknown[]) {
    const r = row as Record<string, unknown> | null
    if (!r || !isPositive(r.voltageV) || !isPositive(r.currentMa)) return null
    readings.push({ voltage: String(r.voltageV), currentMa: String(r.currentMa) })
  }
  return {
    title: note.title,
    course: d.course,
    date: d.date,
    nominalOhms: String(d.nominalOhms),
    tolerancePercent: d.tolerancePercent as number,
    readings,
    observations: d.observations,
    conclusion: d.conclusion,
  }
}

export function isExperimentNote(note: Pick<Note, 'title' | 'content'>): boolean {
  return fromNote(note) !== null
}

/** "17 November 2026" for a stored YYYY-MM-DD (read as a local date, not UTC). */
export function formatLabDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  if (!y || !m || !d) return iso
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'long' }).format(new Date(y, m - 1, d))
}
