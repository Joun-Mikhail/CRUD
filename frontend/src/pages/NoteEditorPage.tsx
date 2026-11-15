import { ArrowLeft, Save, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useBlocker, useNavigate, useParams } from 'react-router'
import { Button } from '../components/ui/Button'
import { buttonClasses } from '../components/ui/buttonStyles'
import { Card } from '../components/ui/Card'
import { ConfirmDialog } from '../components/ui/Dialog'
import { ErrorState } from '../components/ui/ErrorState'
import { Input, Textarea } from '../components/ui/Field'
import { Skeleton } from '../components/ui/Skeleton'
import { useApi } from '../hooks/useApi'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { useNotes } from '../hooks/useNotes'
import { useToast } from '../hooks/useToast'
import { PageHeader } from '../layouts/AppLayout'
import { isApiError } from '../services/apiClient'
import { NOTE_LIMITS, type Note } from '../types/api'
import { summarizeError } from '../utils/errors'
import { formatDateTime } from '../utils/format'
import { charCount, serverIssuesToErrors, validateNote, type NoteFormErrors } from '../utils/noteValidation'

type LoadState = { status: 'loading' } | { status: 'ready'; note: Note | null } | { status: 'error'; error: unknown }

const LOAD_TITLES: Record<string, string> = {
  FORBIDDEN: 'This note belongs to another account',
  NOT_FOUND: 'This note does not exist',
  VALIDATION_ERROR: 'This is not a valid note address',
}

export function NoteEditorPage() {
  const { noteId } = useParams()
  const isNew = noteId === undefined
  useDocumentTitle(isNew ? 'New note' : 'Edit note')
  const { notes: api } = useApi()
  const notes = useNotes()
  const toast = useToast()
  const navigate = useNavigate()

  const [load, setLoad] = useState<LoadState>(isNew ? { status: 'ready', note: null } : { status: 'loading' })
  const [reloadCount, setReloadCount] = useState(0)
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [errors, setErrors] = useState<NoteFormErrors>({})
  const [formError, setFormError] = useState<unknown>(null)
  const [conflict, setConflict] = useState(false)
  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const titleInput = useRef<HTMLInputElement>(null)
  /** Set right before a deliberate navigation (after save/delete) so the guard stays quiet. */
  const leaving = useRef(false)

  const saved = load.status === 'ready' ? load.note : null
  const dirty = load.status === 'ready' && (title !== (saved?.title ?? '') || content !== (saved?.content ?? ''))

  useEffect(() => {
    if (isNew) return
    const controller = new AbortController()
    api
      .get(noteId, controller.signal)
      .then((note) => {
        if (controller.signal.aborted) return
        setLoad({ status: 'ready', note })
        setTitle(note.title)
        setContent(note.content)
        setConflict(false)
        setFormError(null)
        setErrors({})
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) setLoad({ status: 'error', error })
      })
    return () => controller.abort()
  }, [api, isNew, noteId, reloadCount])

  // Unsaved-changes protection: in-app navigation (blocker) and tab close/reload (beforeunload).
  const blocker = useBlocker(useCallback(() => dirty && !leaving.current, [dirty]))
  useEffect(() => {
    if (!dirty) return
    const warn = (event: BeforeUnloadEvent) => event.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  const save = useCallback(async () => {
    if (saving || load.status !== 'ready') return
    const clientErrors = validateNote(title, content)
    setErrors(clientErrors)
    setFormError(null)
    if (clientErrors.title || clientErrors.content) {
      if (clientErrors.title) titleInput.current?.focus()
      return
    }
    setSaving(true)
    try {
      const input = { title: title.trim(), content }
      const note = load.note
        ? await api.update(load.note.noteId, { ...input, version: load.note.version })
        : await api.create(input)
      notes.upsert(note)
      setLoad({ status: 'ready', note })
      setTitle(note.title)
      setContent(note.content)
      setConflict(false)
      toast.success(load.note ? 'Note saved' : 'Note created')
      if (!load.note) {
        leaving.current = true
        void navigate(`/notes/${note.noteId}`, { replace: true })
      }
    } catch (error) {
      if (isApiError(error) && error.code === 'VERSION_CONFLICT') {
        setConflict(true)
      } else if (isApiError(error) && error.code === 'VALIDATION_ERROR') {
        const mapped = serverIssuesToErrors(error.details)
        setErrors(mapped.fields)
        if (mapped.other.length > 0 || (!mapped.fields.title && !mapped.fields.content)) setFormError(error)
      } else {
        setFormError(error)
      }
    } finally {
      setSaving(false)
    }
  }, [api, content, load, navigate, notes, saving, title, toast])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
        event.preventDefault()
        void save()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [save])

  async function remove() {
    if (!saved) return
    setDeleting(true)
    try {
      await api.remove(saved.noteId)
      notes.remove(saved.noteId)
      toast.success('Note deleted')
      leaving.current = true
      void navigate('/notes', { replace: true })
    } catch (error) {
      toast.error(`Could not delete the note: ${summarizeError(error).message}`)
      setDeleting(false)
      setConfirmDelete(false)
    }
  }

  const back = (
    <Link to="/notes" className={buttonClasses('ghost', 'sm', '-ml-2 mb-3')}>
      <ArrowLeft aria-hidden="true" className="size-4" />
      All notes
    </Link>
  )

  if (load.status === 'loading') {
    return (
      <>
        {back}
        <div role="status" aria-label="Loading note" className="flex flex-col gap-4">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-10" />
          <Skeleton className="h-72" />
        </div>
      </>
    )
  }

  if (load.status === 'error') {
    const code = summarizeError(load.error).code ?? ''
    const permanent = code in LOAD_TITLES
    return (
      <>
        {back}
        <ErrorState
          error={load.error}
          title={LOAD_TITLES[code]}
          onRetry={
            permanent
              ? undefined
              : () => {
                  setLoad({ status: 'loading' })
                  setReloadCount((count) => count + 1)
                }
          }
          action={
            permanent ? (
              <Link to="/notes" className={buttonClasses('primary')}>
                Back to your notes
              </Link>
            ) : undefined
          }
        />
      </>
    )
  }

  const titleLength = charCount(title.trim())
  const contentLength = charCount(content)
  return (
    <>
      {back}
      <PageHeader
        title={saved ? 'Edit note' : 'New note'}
        actions={
          saved ? (
            <Button
              variant="ghost"
              icon={<Trash2 aria-hidden="true" className="size-4" />}
              onClick={() => setConfirmDelete(true)}
            >
              Delete
            </Button>
          ) : undefined
        }
      />

      <form
        noValidate
        aria-label={saved ? 'Edit note' : 'New note'}
        onSubmit={(event: FormEvent) => {
          event.preventDefault()
          void save()
        }}
      >
        <Card className="flex flex-col gap-5 p-4 sm:p-6">
          {conflict ? (
            <div role="alert" className="rounded-md bg-warning-soft p-3 text-sm text-warning-ink">
              <p className="font-medium">This note was changed somewhere else after you opened it.</p>
              <p className="mt-1">
                Your edit was not saved, so nothing was overwritten. Copy anything you want to keep, then load
                the latest version.
              </p>
              <Button
                size="sm"
                className="mt-2"
                onClick={() => {
                  setLoad({ status: 'loading' })
                  setReloadCount((count) => count + 1)
                }}
              >
                Discard my changes and load the latest version
              </Button>
            </div>
          ) : null}
          {formError ? (
            <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger-ink">
              Could not save: {summarizeError(formError).message}
              {summarizeError(formError).requestId ? ` (request ${summarizeError(formError).requestId})` : ''}
            </p>
          ) : null}

          <Input
            ref={titleInput}
            label="Title"
            name="title"
            required
            autoFocus={!saved}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            error={errors.title}
            counter={`${titleLength}/${NOTE_LIMITS.titleMax}`}
          />
          <Textarea
            label="Content"
            name="content"
            rows={14}
            value={content}
            onChange={(event) => setContent(event.target.value)}
            error={errors.content}
            counter={`${contentLength.toLocaleString('en-US')}/${NOTE_LIMITS.contentMax.toLocaleString('en-US')}`}
            className="min-h-48 resize-y font-mono text-[0.8125rem]"
          />

          <div className="flex flex-wrap items-center gap-3">
            <Button
              type="submit"
              variant="primary"
              loading={saving}
              disabled={conflict}
              icon={<Save aria-hidden="true" className="size-4" />}
            >
              {saved ? 'Save changes' : 'Create note'}
            </Button>
            <Link to="/notes" className={buttonClasses('secondary')}>
              Cancel
            </Link>
            <span className="text-xs text-muted" aria-live="polite">
              {dirty ? 'Unsaved changes' : saved ? 'All changes saved' : ''}
              <span className="hidden sm:inline"> · Ctrl/⌘ + S to save</span>
            </span>
          </div>
        </Card>
      </form>

      {saved ? (
        <dl className="mt-4 grid gap-x-6 gap-y-1 text-xs text-muted sm:grid-cols-2">
          <div className="flex gap-2">
            <dt>Created</dt>
            <dd className="text-fg">{formatDateTime(saved.createdAt)}</dd>
          </div>
          <div className="flex gap-2">
            <dt>Updated</dt>
            <dd className="text-fg">{formatDateTime(saved.updatedAt)}</dd>
          </div>
          <div className="flex gap-2">
            <dt>Version</dt>
            <dd className="text-fg">{saved.version}</dd>
          </div>
          <div className="flex min-w-0 gap-2">
            <dt>Note ID</dt>
            <dd className="truncate font-mono text-fg">{saved.noteId}</dd>
          </div>
        </dl>
      ) : null}

      <ConfirmDialog
        open={blocker.state === 'blocked'}
        title="Discard unsaved changes?"
        description="You have changes that have not been saved. If you leave now they will be lost."
        confirmLabel="Discard changes"
        cancelLabel="Keep editing"
        destructive
        onConfirm={() => blocker.proceed?.()}
        onCancel={() => blocker.reset?.()}
      />
      <ConfirmDialog
        open={confirmDelete}
        title="Delete this note?"
        description={<>“{saved?.title}” will be permanently deleted. This cannot be undone.</>}
        confirmLabel="Delete note"
        destructive
        busy={deleting}
        onConfirm={() => void remove()}
        onCancel={() => setConfirmDelete(false)}
      />
    </>
  )
}
