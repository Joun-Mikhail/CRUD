import type { DeleteResult, ListMeta, Note, NoteInput, NotesPage, NoteUpdateInput } from '../types/api'
import { ApiError, type ApiClient } from './apiClient'

export interface NotesApi {
  list(params?: { limit?: number; nextToken?: string | null }, signal?: AbortSignal): Promise<NotesPage>
  get(noteId: string, signal?: AbortSignal): Promise<Note>
  create(input: NoteInput): Promise<Note>
  update(noteId: string, input: NoteUpdateInput): Promise<Note>
  remove(noteId: string): Promise<DeleteResult>
}

interface DataEnvelope<T> {
  data: T
}

function unwrap<T>(body: unknown): T {
  if (typeof body === 'object' && body !== null && 'data' in body) {
    return (body as DataEnvelope<T>).data
  }
  throw new ApiError({
    kind: 'invalid-response',
    status: 200,
    code: 'INVALID_RESPONSE',
    message: 'The API response did not contain the expected "data" field.',
  })
}

const notePath = (noteId: string) => `/notes/${encodeURIComponent(noteId)}`

export function createNotesApi(client: ApiClient): NotesApi {
  return {
    async list(params = {}, signal) {
      const body = await client.request<unknown>({
        method: 'GET',
        path: '/notes',
        query: { limit: params.limit, nextToken: params.nextToken },
        signal,
      })
      const notes = unwrap<Note[]>(body)
      const meta = (body as { meta?: ListMeta }).meta
      return {
        notes,
        meta: meta ?? { count: notes.length, limit: params.limit ?? notes.length, nextToken: null },
      }
    },
    async get(noteId, signal) {
      return unwrap<Note>(await client.request({ method: 'GET', path: notePath(noteId), signal }))
    },
    async create(input) {
      return unwrap<Note>(await client.request({ method: 'POST', path: '/notes', body: input }))
    },
    async update(noteId, input) {
      return unwrap<Note>(await client.request({ method: 'PUT', path: notePath(noteId), body: input }))
    },
    async remove(noteId) {
      return unwrap<DeleteResult>(await client.request({ method: 'DELETE', path: notePath(noteId) }))
    },
  }
}
