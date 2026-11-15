import { NOTE_LIMITS, type FieldIssue } from '../types/api'

export interface NoteFormErrors {
  title?: string
  content?: string
}

// Same character classes the server rejects (backend/src/notes_api/validation/notes.py).
// eslint-disable-next-line no-control-regex
const TITLE_FORBIDDEN = /[\u0000-\u001f\u007f]/

/** Python's len() counts code points; String.length counts UTF-16 units. Mirror the server. */
export function charCount(value: string): number {
  return Array.from(value).length
}

/** Client-side mirror of the server rules, so most mistakes never need a round trip. */
export function validateNote(title: string, content: string): NoteFormErrors {
  const errors: NoteFormErrors = {}
  const trimmed = title.trim()
  if (!trimmed) errors.title = 'Enter a title.'
  else if (charCount(trimmed) > NOTE_LIMITS.titleMax) {
    errors.title = `The title must be at most ${NOTE_LIMITS.titleMax} characters.`
  } else if (TITLE_FORBIDDEN.test(trimmed)) {
    errors.title = 'The title must not contain control characters or line breaks.'
  }
  if (charCount(content) > NOTE_LIMITS.contentMax) {
    errors.content = `The content must be at most ${NOTE_LIMITS.contentMax.toLocaleString('en-US')} characters.`
  } else if (content.includes('\u0000')) {
    errors.content = 'The content must not contain NUL characters.'
  }
  return errors
}

/** Maps the `details` of a server VALIDATION_ERROR onto the form fields. */
export function serverIssuesToErrors(details: FieldIssue[] | undefined): {
  fields: NoteFormErrors
  other: string[]
} {
  const fields: NoteFormErrors = {}
  const other: string[] = []
  for (const { field, issue } of details ?? []) {
    if (field === 'title' || field === 'content') {
      fields[field] ??= `The ${field} ${issue}.`
    } else {
      other.push(`${field}: ${issue}`)
    }
  }
  return { fields, other }
}
