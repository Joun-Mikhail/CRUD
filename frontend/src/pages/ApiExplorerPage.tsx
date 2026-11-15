import { Play } from 'lucide-react'
import { useState } from 'react'
import { Badge, type BadgeTone } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { ConfirmDialog } from '../components/ui/Dialog'
import { Input, Textarea } from '../components/ui/Field'
import { useApi } from '../hooks/useApi'
import { useAuth } from '../hooks/useAuth'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { useNotes } from '../hooks/useNotes'
import { PageHeader } from '../layouts/AppLayout'
import type { Exchange } from '../services/apiClient'
import type { HttpMethod } from '../types/api'
import { cx } from '../utils/cx'
import { ENDPOINTS, type EndpointSpec } from './apiEndpoints'

const METHOD_TONES: Record<HttpMethod, BadgeTone> = {
  GET: 'accent',
  POST: 'success',
  PUT: 'warning',
  DELETE: 'danger',
}

function statusTone(status: number): BadgeTone {
  if (status === 0) return 'danger'
  if (status < 300) return 'success'
  return status < 500 ? 'warning' : 'danger'
}

function CodeBlock({ label, children }: { label: string; children: string }) {
  return (
    <div>
      <p className="mb-1 text-xs font-medium text-muted">{label}</p>
      <pre
        tabIndex={0}
        aria-label={label}
        className="max-h-96 overflow-auto rounded-md border border-line bg-canvas p-3 text-xs leading-relaxed whitespace-pre-wrap text-fg"
      >
        {children}
      </pre>
    </div>
  )
}

export function ApiExplorerPage() {
  useDocumentTitle('API explorer')
  const { client } = useApi()
  const { service } = useAuth()
  const notes = useNotes()
  const [endpointId, setEndpointId] = useState('list')
  const [noteId, setNoteId] = useState('')
  const [limit, setLimit] = useState('')
  const [nextToken, setNextToken] = useState('')
  const [bodies, setBodies] = useState<Record<string, string>>({})
  const [withoutAuth, setWithoutAuth] = useState(false)
  const [sending, setSending] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [exchange, setExchange] = useState<Exchange | null>(null)

  const endpoint = ENDPOINTS.find((item) => item.id === endpointId) as EndpointSpec
  const needsId = endpoint.path === '/notes/{id}'
  const body = bodies[endpoint.id] ?? endpoint.exampleBody ?? ''
  const path = needsId ? `/notes/${encodeURIComponent(noteId.trim())}` : '/notes'
  const query = endpoint.id === 'list' ? { limit: limit.trim() || undefined, nextToken: nextToken.trim() || undefined } : undefined
  const url = client.buildUrl(path, query)
  const authorization = withoutAuth ? null : service.describeAuthorization()
  const missingId = needsId && noteId.trim() === ''

  async function send() {
    setConfirming(false)
    setSending(true)
    try {
      const result = await client.send({
        method: endpoint.method,
        path,
        query,
        rawBody: endpoint.hasBody ? body : undefined,
        auth: withoutAuth ? 'none' : 'default',
        // Show the raw outcome: a 401 here must not sign the user out of the app.
        recoverSession: false,
      })
      setExchange(result)
      if (result.ok && endpoint.method !== 'GET') notes.reload()
    } finally {
      setSending(false)
    }
  }

  return (
    <>
      <PageHeader
        title="API explorer"
        description="Send real requests to the configured backend and inspect exactly what comes back."
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
        <div className="flex flex-col gap-4">
          <Card className="p-2">
            <h2 className="sr-only">Endpoints</h2>
            <ul className="flex flex-col gap-0.5">
              {ENDPOINTS.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    aria-pressed={item.id === endpointId}
                    onClick={() => setEndpointId(item.id)}
                    className={cx(
                      'flex w-full items-center gap-3 rounded-md px-2.5 py-2 text-left',
                      item.id === endpointId ? 'bg-accent-soft' : 'hover:bg-subtle',
                    )}
                  >
                    <Badge tone={METHOD_TONES[item.method]} className="w-14 justify-center font-mono">
                      {item.method}
                    </Badge>
                    <code className="text-sm text-fg">{item.path}</code>
                    <span className="ml-auto hidden text-xs text-muted sm:block">{item.operation}</span>
                  </button>
                </li>
              ))}
            </ul>
          </Card>

          <Card className="p-4">
            <h2 className="text-sm font-semibold text-fg">
              {endpoint.method} {endpoint.path}
            </h2>
            <p className="mt-1 text-sm text-muted">{endpoint.summary}</p>
            <dl className="mt-3 grid gap-2 text-xs">
              <div>
                <dt className="font-medium text-fg">Required scope</dt>
                <dd className="text-muted">
                  <code>{endpoint.scope}</code> (checked by API Gateway in AWS mode)
                </dd>
              </div>
              <div>
                <dt className="font-medium text-fg">Success</dt>
                <dd className="text-muted">
                  {endpoint.success} — <code>{endpoint.responseShape}</code>
                </dd>
              </div>
              <div>
                <dt className="font-medium text-fg">Errors</dt>
                <dd className="text-muted">
                  {endpoint.errors.join(' · ')} — <code>{'{ "error": { "code", "message", "requestId" } }'}</code>
                </dd>
              </div>
            </dl>
          </Card>
        </div>

        <div className="flex min-w-0 flex-col gap-4">
          <Card className="flex flex-col gap-4 p-4">
            <h2 className="text-sm font-semibold text-fg">Request</h2>
            {needsId ? (
              <div className="flex flex-col gap-2">
                <Input
                  label="Note id"
                  placeholder="UUID of a note"
                  value={noteId}
                  onChange={(event) => setNoteId(event.target.value)}
                  className="font-mono"
                />
                {notes.notes.length > 0 ? (
                  <label className="flex flex-col gap-1 text-xs text-muted">
                    Or pick one of your loaded notes
                    <select
                      value=""
                      onChange={(event) => setNoteId(event.target.value)}
                      className="h-9 rounded-md border border-line-strong bg-surface px-2 text-sm text-fg"
                    >
                      <option value="">Choose…</option>
                      {notes.notes.map((note) => (
                        <option key={note.noteId} value={note.noteId}>
                          {note.title}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}
              </div>
            ) : null}
            {endpoint.id === 'list' ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <Input label="limit" placeholder="20" value={limit} onChange={(event) => setLimit(event.target.value)} />
                <Input
                  label="nextToken"
                  placeholder="from a previous response"
                  value={nextToken}
                  onChange={(event) => setNextToken(event.target.value)}
                />
              </div>
            ) : null}
            {endpoint.hasBody ? (
              <Textarea
                label="JSON body"
                rows={6}
                spellCheck={false}
                value={body}
                onChange={(event) => setBodies((current) => ({ ...current, [endpoint.id]: event.target.value }))}
                className="font-mono text-xs"
                hint="Sent exactly as typed, so you can also try invalid JSON."
              />
            ) : null}
            <label className="flex items-start gap-2 text-sm text-fg">
              <input
                type="checkbox"
                checked={withoutAuth}
                onChange={(event) => setWithoutAuth(event.target.checked)}
                className="mt-0.5 size-4 accent-(--accent)"
              />
              <span>
                Send without the Authorization header
                <span className="block text-xs text-muted">Demonstrates the 401 an unauthenticated visitor receives.</span>
              </span>
            </label>
            <CodeBlock label="Request preview">
              {[
                `${endpoint.method} ${url}`,
                authorization ? `Authorization: ${authorization}` : '(no Authorization header)',
                endpoint.hasBody ? 'Content-Type: application/json' : null,
              ]
                .filter(Boolean)
                .join('\n')}
            </CodeBlock>
            <div>
              <Button
                variant="primary"
                loading={sending}
                disabled={missingId}
                icon={<Play aria-hidden="true" className="size-4" />}
                onClick={() => (endpoint.method === 'DELETE' && !withoutAuth ? setConfirming(true) : void send())}
              >
                Send request
              </Button>
              {missingId ? <p className="mt-1.5 text-xs text-muted">Enter a note id first.</p> : null}
            </div>
          </Card>

          <Card className="flex flex-col gap-3 p-4" aria-live="polite">
            <h2 className="text-sm font-semibold text-fg">Response</h2>
            {exchange ? (
              <div data-testid="exchange" className="flex flex-col gap-3">
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <Badge tone={statusTone(exchange.status)} className="font-mono">
                    <span data-testid="exchange-status">{exchange.status === 0 ? 'No response' : exchange.status}</span>
                  </Badge>
                  <span className="text-muted" data-testid="exchange-duration">
                    {exchange.durationMs.toFixed(0)} ms (measured in this browser)
                  </span>
                </div>
                <p className="font-mono text-xs break-all text-muted">
                  {exchange.method} {exchange.url}
                </p>
                {exchange.error ? (
                  <p className="text-sm text-fg">
                    <span className="font-medium">{exchange.error.code}</span>: {exchange.error.message}
                    {exchange.error.requestId ? (
                      <span className="block text-xs text-muted">Request id: {exchange.error.requestId}</span>
                    ) : null}
                  </p>
                ) : null}
                {exchange.requestBody ? <CodeBlock label="Request body sent">{exchange.requestBody}</CodeBlock> : null}
                <CodeBlock label="Response body">
                  {exchange.json !== null && exchange.json !== undefined
                    ? JSON.stringify(exchange.json, null, 2)
                    : (exchange.text ?? '(empty)')}
                </CodeBlock>
              </div>
            ) : (
              <p className="text-sm text-muted">Nothing sent yet. Choose an endpoint and press “Send request”.</p>
            )}
          </Card>
        </div>
      </div>

      <ConfirmDialog
        open={confirming}
        title="Send this DELETE request?"
        description="This permanently deletes the note with the id you entered."
        confirmLabel="Delete note"
        destructive
        onConfirm={() => void send()}
        onCancel={() => setConfirming(false)}
      />
    </>
  )
}
