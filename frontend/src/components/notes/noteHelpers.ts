import type { Note } from '../../types/api'

export type NoteSort = 'created-desc' | 'updated-desc' | 'title-asc'

export const SORT_LABELS: Record<NoteSort, string> = {
  'created-desc': 'Newest first',
  'updated-desc': 'Recently updated',
  'title-asc': 'Title A–Z',
}

/** Client-side filter + sort. It only ever sees the notes loaded so far. */
export function filterAndSort(notes: readonly Note[], query: string, sort: NoteSort): Note[] {
  const needle = query.trim().toLocaleLowerCase()
  const matching = needle
    ? notes.filter(
        (note) =>
          note.title.toLocaleLowerCase().includes(needle) || note.content.toLocaleLowerCase().includes(needle),
      )
    : [...notes]
  switch (sort) {
    case 'updated-desc':
      return matching.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    case 'title-asc':
      return matching.sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: 'base' }))
    case 'created-desc':
      return matching.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  }
}

export function recentlyUpdated(notes: readonly Note[], count: number): Note[] {
  return [...notes].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, count)
}

/** "20+" when the API reported more pages than have been loaded. */
export function loadedCountLabel(count: number, hasMore: boolean): string {
  return hasMore ? `${count}+` : String(count)
}
