/** Wire types of the notes API (see backend/src/notes_api). */

export interface Note {
  noteId: string
  userId: string
  title: string
  content: string
  /** ISO-8601 UTC */
  createdAt: string
  /** ISO-8601 UTC */
  updatedAt: string
  version: number
}

export interface NoteInput {
  title: string
  content: string
}

export interface NoteUpdateInput extends NoteInput {
  /** Enables optimistic locking: the server rejects the update with 409 if stale. */
  version?: number
}

export interface ListMeta {
  count: number
  limit: number
  nextToken: string | null
}

export interface NotesPage {
  notes: Note[]
  meta: ListMeta
}

export interface DeleteResult {
  noteId: string
  deleted: true
}

export interface FieldIssue {
  field: string
  issue: string
}

export interface ErrorEnvelope {
  error: {
    code: string
    message: string
    requestId?: string
    details?: FieldIssue[]
  }
}

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE'

export const NOTE_LIMITS = {
  titleMax: 200,
  contentMax: 20_000,
  pageSizeDefault: 20,
  pageSizeMax: 100,
} as const
