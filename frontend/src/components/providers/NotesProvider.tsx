import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useApi } from '../../hooks/useApi'
import { NotesContext, type NotesState, type NotesStatus } from '../../hooks/useNotes'
import type { Note } from '../../types/api'

interface State {
  status: NotesStatus
  notes: Note[]
  error: unknown
  nextToken: string | null
  loadingMore: boolean
  loadMoreError: unknown
}

const INITIAL: State = {
  status: 'loading',
  notes: [],
  error: null,
  nextToken: null,
  loadingMore: false,
  loadMoreError: null,
}

function mergeById(current: Note[], incoming: Note[]): Note[] {
  const seen = new Set(current.map((note) => note.noteId))
  return [...current, ...incoming.filter((note) => !seen.has(note.noteId))]
}

/**
 * Holds the pages of notes loaded so far. Mount it with `key={user.id}` so switching the
 * identity starts from a clean state (no note of one user is ever shown to another).
 */
export function NotesProvider({ children }: { children: ReactNode }) {
  const { notes: api } = useApi()
  const [state, setState] = useState<State>(INITIAL)
  const [loadCount, setLoadCount] = useState(0)
  const stateRef = useRef(state)
  useEffect(() => {
    stateRef.current = state
  }, [state])

  useEffect(() => {
    const controller = new AbortController()
    api
      .list({}, controller.signal)
      .then((page) => {
        if (controller.signal.aborted) return
        setState({ ...INITIAL, status: 'ready', notes: page.notes, nextToken: page.meta.nextToken })
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return
        setState({ ...INITIAL, status: 'error', error })
      })
    return () => controller.abort()
  }, [api, loadCount])

  const reload = useCallback(() => {
    setState(INITIAL)
    setLoadCount((count) => count + 1)
  }, [])

  const loadMore = useCallback(() => {
    const { nextToken, loadingMore, status } = stateRef.current
    if (!nextToken || loadingMore || status !== 'ready') return
    setState((current) => ({ ...current, loadingMore: true, loadMoreError: null }))
    api
      .list({ nextToken })
      .then((page) => {
        setState((current) =>
          current.nextToken === nextToken
            ? {
                ...current,
                notes: mergeById(current.notes, page.notes),
                nextToken: page.meta.nextToken,
                loadingMore: false,
              }
            : current,
        )
      })
      .catch((error: unknown) => {
        setState((current) => ({ ...current, loadingMore: false, loadMoreError: error }))
      })
  }, [api])

  const upsert = useCallback((note: Note) => {
    setState((current) => {
      const exists = current.notes.some((item) => item.noteId === note.noteId)
      return {
        ...current,
        notes: exists
          ? current.notes.map((item) => (item.noteId === note.noteId ? note : item))
          : [note, ...current.notes],
      }
    })
  }, [])

  const remove = useCallback((noteId: string) => {
    setState((current) => ({ ...current, notes: current.notes.filter((note) => note.noteId !== noteId) }))
  }, [])

  const value = useMemo<NotesState>(
    () => ({
      status: state.status,
      notes: state.notes,
      error: state.error,
      hasMore: state.nextToken !== null,
      loadingMore: state.loadingMore,
      loadMoreError: state.loadMoreError,
      reload,
      loadMore,
      upsert,
      remove,
    }),
    [state, reload, loadMore, upsert, remove],
  )

  return <NotesContext.Provider value={value}>{children}</NotesContext.Provider>
}
