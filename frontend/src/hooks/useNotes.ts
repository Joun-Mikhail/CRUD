import { createContext, useContext } from 'react'
import type { Note } from '../types/api'

export type NotesStatus = 'loading' | 'ready' | 'error'

/** The notes loaded so far for the signed-in user (newest created first, as the API returns them). */
export interface NotesState {
  status: NotesStatus
  notes: Note[]
  /** Error of the initial load. */
  error: unknown
  /** True while the API reports another page (`meta.nextToken`). */
  hasMore: boolean
  loadingMore: boolean
  loadMoreError: unknown
  reload(): void
  loadMore(): void
  /** Insert or replace a note after a successful create/update. */
  upsert(note: Note): void
  remove(noteId: string): void
}

export const NotesContext = createContext<NotesState | null>(null)

export function useNotes(): NotesState {
  const notes = useContext(NotesContext)
  if (!notes) throw new Error('useNotes must be used inside <NotesProvider>')
  return notes
}
