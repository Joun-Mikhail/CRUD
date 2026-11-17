import { FlaskConical, Plus, StickyNote } from 'lucide-react'
import { Link } from 'react-router'
import { loadedCountLabel, noteExcerpt, noteLink, recentlyUpdated } from '../components/notes/noteHelpers'
import { buttonClasses } from '../components/ui/buttonStyles'
import { Card } from '../components/ui/Card'
import { EmptyState } from '../components/ui/EmptyState'
import { ErrorState } from '../components/ui/ErrorState'
import { Skeleton } from '../components/ui/Skeleton'
import { useAuth } from '../hooks/useAuth'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { useNotes } from '../hooks/useNotes'
import { LabHero } from '../lab/LabHero'
import { PageHeader } from '../layouts/AppLayout'
import { formatDateTime, formatRelative } from '../utils/format'

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card className="p-4">
      <p className="text-xs font-medium tracking-wide text-muted uppercase">{label}</p>
      <p className="mt-1.5 text-2xl font-semibold tracking-tight text-fg">{value}</p>
      {hint ? <p className="mt-1 text-xs text-muted">{hint}</p> : null}
    </Card>
  )
}

export function DashboardPage() {
  useDocumentTitle('Dashboard')
  const { user } = useAuth()
  const notes = useNotes()
  const recent = recentlyUpdated(notes.notes, 5)
  const latest = recent[0]

  return (
    <>
      <PageHeader
        title={`Welcome, ${user?.displayName ?? 'there'}`}
        description={<>Signed in as {user?.email}. Only you can read or change your notes.</>}
        actions={
          <Link to="/notes/new" className={buttonClasses('secondary')}>
            <Plus aria-hidden="true" className="size-4" />
            New note
          </Link>
        }
      />

      <div className="mb-8">
        <LabHero
          level={2}
          title="Ohm’s law verification"
          text="Enter your voltage and current readings, get the resistance and the V–I graph instantly, and print a professional lab report."
          action={
            <>
              <Link to="/lab/new" className={buttonClasses('inverse')}>
                <FlaskConical aria-hidden="true" className="size-4" />
                New experiment
              </Link>
              <Link to="/lab" className={buttonClasses('ghost', 'md', 'text-white hover:bg-white/15 hover:text-white')}>
                Your experiments
              </Link>
            </>
          }
        />
      </div>

      {notes.status === 'loading' ? (
        <div role="status" aria-label="Loading your notes" className="grid gap-4 sm:grid-cols-2">
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
          <Skeleton className="h-48 sm:col-span-2" />
        </div>
      ) : null}

      {notes.status === 'error' ? <ErrorState error={notes.error} onRetry={notes.reload} /> : null}

      {notes.status === 'ready' && notes.notes.length === 0 ? (
        <EmptyState
          icon={<StickyNote aria-hidden="true" className="size-5" />}
          title="No notes yet"
          description="Create your first note. It is stored through the API and belongs only to your account."
          action={
            <Link to="/notes/new" className={buttonClasses('primary')}>
              <Plus aria-hidden="true" className="size-4" />
              Create your first note
            </Link>
          }
        />
      ) : null}

      {notes.status === 'ready' && notes.notes.length > 0 ? (
        <div className="flex flex-col gap-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <Stat
              label="Your notes"
              value={loadedCountLabel(notes.notes.length, notes.hasMore)}
              hint={
                notes.hasMore
                  ? 'More notes exist than have been loaded so far. Open Notes to load them.'
                  : 'All of your notes are loaded.'
              }
            />
            <Stat
              label="Last change"
              value={latest ? formatRelative(latest.updatedAt) : '—'}
              hint={latest ? formatDateTime(latest.updatedAt) : undefined}
            />
          </div>

          <section aria-labelledby="recent-heading">
            <div className="mb-3 flex items-center justify-between">
              <h2 id="recent-heading" className="text-base font-semibold text-fg">
                Recently updated
              </h2>
              <Link to="/notes" className="text-sm font-medium text-accent-ink underline-offset-2 hover:underline">
                All notes
              </Link>
            </div>
            <Card>
              <ul className="divide-y divide-line">
                {recent.map((note) => (
                  <li key={note.noteId}>
                    <Link to={noteLink(note)} className="block px-4 py-3 hover:bg-subtle">
                      <span className="flex items-baseline justify-between gap-3">
                        <span className="truncate text-sm font-medium text-fg">{note.title}</span>
                        <span className="shrink-0 text-xs text-muted">{formatRelative(note.updatedAt)}</span>
                      </span>
                      <span className="mt-0.5 block truncate text-sm text-muted">
                        {noteExcerpt(note, 110) || 'No content'}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          </section>
        </div>
      ) : null}
    </>
  )
}
