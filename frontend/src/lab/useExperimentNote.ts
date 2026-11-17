import { useEffect, useState } from 'react'
import { useApi } from '../hooks/useApi'
import type { Note } from '../types/api'
import { fromNote, type LabExperiment } from './experimentFormat'

export type ExperimentLoad =
  | { status: 'loading' }
  | { status: 'ready'; note: Note; experiment: LabExperiment }
  /** The note exists and belongs to the user, but it is an ordinary note, not an experiment. */
  | { status: 'not-experiment'; note: Note }
  | { status: 'error'; error: unknown }

/** Loads one experiment with GET /notes/{noteId}. `reloadKey` forces a fresh load. */
export function useExperimentNote(noteId: string | undefined, reloadKey = 0): ExperimentLoad {
  const { notes: api } = useApi()
  const [state, setState] = useState<{ key: string; load: ExperimentLoad } | null>(null)
  const key = `${noteId ?? ''}#${reloadKey}`

  useEffect(() => {
    if (!noteId) return
    const controller = new AbortController()
    api
      .get(noteId, controller.signal)
      .then((note) => {
        if (controller.signal.aborted) return
        const experiment = fromNote(note)
        setState({
          key,
          load: experiment ? { status: 'ready', note, experiment } : { status: 'not-experiment', note },
        })
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) setState({ key, load: { status: 'error', error } })
      })
    return () => controller.abort()
  }, [api, noteId, key])

  // A result from a previous noteId/reload never leaks into the current one.
  return state && state.key === key ? state.load : { status: 'loading' }
}
