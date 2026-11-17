import { LayoutGrid, List, Plus, Search, StickyNote, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'
import { filterAndSort, noteExcerpt, noteLink, SORT_LABELS, type NoteSort } from '../components/notes/noteHelpers'
import { Button } from '../components/ui/Button'
import { buttonClasses } from '../components/ui/buttonStyles'
import { Card } from '../components/ui/Card'
import { ConfirmDialog } from '../components/ui/Dialog'
import { EmptyState } from '../components/ui/EmptyState'
import { ErrorState } from '../components/ui/ErrorState'
import { Input } from '../components/ui/Field'
import { Skeleton } from '../components/ui/Skeleton'
import { useApi } from '../hooks/useApi'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { useNotes } from '../hooks/useNotes'
import { useToast } from '../hooks/useToast'
import { PageHeader } from '../layouts/AppLayout'
import type { Note } from '../types/api'
import { cx } from '../utils/cx'
import { summarizeError } from '../utils/errors'
import { formatRelative, pluralize } from '../utils/format'

type View = 'list' | 'cards'
const VIEW_KEY = 'sn.notes.view'

function readView(): View {
  try {
    return window.localStorage.getItem(VIEW_KEY) === 'cards' ? 'cards' : 'list'
  } catch {
    return 'list'
  }
}

function NoteRow({ note, view, onDelete }: { note: Note; view: View; onDelete: (note: Note) => void }) {
  return (
    <li
      className={cx(
        'group relative flex gap-3',
        view === 'cards'
          ? 'flex-col rounded-lg border border-line bg-surface p-4 shadow-card hover:border-line-strong'
          : 'items-center px-4 py-3 hover:bg-subtle',
      )}
    >
      <div className="min-w-0 flex-1">
        <h2 className="truncate text-sm font-medium text-fg">
          {/* The stretched link makes the whole row clickable while keeping one tab stop. */}
          <Link to={noteLink(note)} className="after:absolute after:inset-0">
            {note.title}
          </Link>
        </h2>
        <p className={cx('mt-0.5 text-sm text-muted', view === 'cards' ? 'line-clamp-3 min-h-15' : 'truncate')}>
          {noteExcerpt(note, view === 'cards' ? 220 : 120) || 'No content'}
        </p>
      </div>
      <div className={cx('flex shrink-0 items-center gap-2', view === 'cards' && 'justify-between')}>
        <span className={cx('text-xs text-muted', view === 'list' && 'hidden sm:inline')}>
          Updated {formatRelative(note.updatedAt)}
        </span>
        <Button
          variant="ghost"
          size="sm"
          className="relative z-10"
          aria-label={`Delete note “${note.title}”`}
          onClick={() => onDelete(note)}
        >
          <Trash2 aria-hidden="true" className="size-4" />
        </Button>
      </div>
    </li>
  )
}

export function NotesPage() {
  useDocumentTitle('Notes')
  const notes = useNotes()
  const { notes: api } = useApi()
  const toast = useToast()
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<NoteSort>('created-desc')
  const [view, setView] = useState<View>(readView)
  const [pendingDelete, setPendingDelete] = useState<Note | null>(null)
  const [deleting, setDeleting] = useState(false)

  const visible = filterAndSort(notes.notes, query, sort)
  const loaded = notes.notes.length

  function chooseView(next: View) {
    setView(next)
    try {
      window.localStorage.setItem(VIEW_KEY, next)
    } catch {
      // Preference persistence is optional.
    }
  }

  async function confirmDelete() {
    if (!pendingDelete) return
    setDeleting(true)
    try {
      await api.remove(pendingDelete.noteId)
      notes.remove(pendingDelete.noteId)
      toast.success('Note deleted')
      setPendingDelete(null)
    } catch (error) {
      const summary = summarizeError(error)
      toast.error(`Could not delete the note: ${summary.message}`)
      // 404 means it is already gone on the server; keep the list truthful.
      if (summary.code === 'NOT_FOUND') {
        notes.remove(pendingDelete.noteId)
        setPendingDelete(null)
      }
    } finally {
      setDeleting(false)
    }
  }

  return (
    <>
      <PageHeader
        title="Notes"
        description="Your private notes, newest first."
        actions={
          <Link to="/notes/new" className={buttonClasses('primary')}>
            <Plus aria-hidden="true" className="size-4" />
            New note
          </Link>
        }
      />

      {notes.status === 'loading' ? (
        <div role="status" aria-label="Loading notes" className="flex flex-col gap-2">
          {[0, 1, 2, 3].map((index) => (
            <Skeleton key={index} className="h-16" />
          ))}
        </div>
      ) : null}

      {notes.status === 'error' ? <ErrorState error={notes.error} onRetry={notes.reload} /> : null}

      {notes.status === 'ready' && loaded === 0 ? (
        <EmptyState
          icon={<StickyNote aria-hidden="true" className="size-5" />}
          title="No notes yet"
          description="Notes you create appear here."
          action={
            <Link to="/notes/new" className={buttonClasses('primary')}>
              <Plus aria-hidden="true" className="size-4" />
              Create a note
            </Link>
          }
        />
      ) : null}

      {notes.status === 'ready' && loaded > 0 ? (
        <>
          <div className="mb-3 flex flex-wrap items-end gap-3">
            <Input
              label="Search loaded notes"
              hideLabel
              type="search"
              placeholder="Search loaded notes…"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              containerClassName="min-w-48 flex-1"
              trailing={<Search aria-hidden="true" className="mr-2 size-4 text-faint" />}
            />
            <label className="flex items-center gap-2 text-sm text-muted">
              <span className="sr-only sm:not-sr-only">Sort</span>
              <select
                value={sort}
                onChange={(event) => setSort(event.target.value as NoteSort)}
                aria-label="Sort notes"
                className="h-10 rounded-md border border-line-strong bg-surface px-2.5 text-sm text-fg"
              >
                {Object.entries(SORT_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <div role="group" aria-label="View" className="flex rounded-md border border-line-strong bg-surface p-0.5">
              {(
                [
                  ['list', List, 'List view'],
                  ['cards', LayoutGrid, 'Card view'],
                ] as const
              ).map(([value, Icon, label]) => (
                <button
                  key={value}
                  type="button"
                  aria-label={label}
                  aria-pressed={view === value}
                  onClick={() => chooseView(value)}
                  className={cx(
                    'flex size-8.5 items-center justify-center rounded-sm',
                    view === value ? 'bg-accent-soft text-accent-ink' : 'text-muted hover:text-fg',
                  )}
                >
                  <Icon aria-hidden="true" className="size-4" />
                </button>
              ))}
            </div>
          </div>

          <p className="mb-3 text-xs text-muted" data-testid="notes-scope">
            {query.trim()
              ? `${visible.length} of ${loaded} loaded ${pluralize(loaded, 'note')} match. `
              : `${loaded} ${pluralize(loaded, 'note')} loaded. `}
            Search and sorting apply only to notes loaded in this browser
            {notes.hasMore ? ' — more exist on the server; use “Load more”.' : '.'}
          </p>

          {visible.length === 0 ? (
            <EmptyState title="No loaded note matches your search" description="Try another term or load more notes." />
          ) : view === 'cards' ? (
            <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {visible.map((note) => (
                <NoteRow key={note.noteId} note={note} view={view} onDelete={setPendingDelete} />
              ))}
            </ul>
          ) : (
            <Card>
              <ul className="divide-y divide-line">
                {visible.map((note) => (
                  <NoteRow key={note.noteId} note={note} view={view} onDelete={setPendingDelete} />
                ))}
              </ul>
            </Card>
          )}

          {notes.hasMore ? (
            <div className="mt-5 flex flex-col items-center gap-2">
              {notes.loadMoreError ? (
                <p role="alert" className="text-sm text-danger-ink">
                  Could not load more notes: {summarizeError(notes.loadMoreError).message}
                </p>
              ) : null}
              <Button onClick={notes.loadMore} loading={notes.loadingMore}>
                Load more
              </Button>
            </div>
          ) : null}
        </>
      ) : null}

      <ConfirmDialog
        open={pendingDelete !== null}
        title="Delete this note?"
        description={
          <>
            “{pendingDelete?.title}” will be permanently deleted. This cannot be undone.
          </>
        }
        confirmLabel="Delete note"
        destructive
        busy={deleting}
        onConfirm={() => void confirmDelete()}
        onCancel={() => setPendingDelete(null)}
      />
    </>
  )
}
