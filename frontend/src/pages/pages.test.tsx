import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { CognitoAuthService } from '../services/auth/cognitoAuth'
import { DemoAuthService } from '../services/auth/demoAuth'
import { ApiError } from '../services/apiClient'
import { CognitoError } from '../services/cognito/idp'
import { DEMO_CONFIG, fakeNotesApi, makeNote, renderApp } from '../test/helpers'
import type { AwsAppConfig } from '../types/config'

const NOTE_ID = '11111111-1111-4111-8111-111111111111'

function httpError(status: number, code: string, message: string, details?: { field: string; issue: string }[]) {
  return new ApiError({ kind: 'http', status, code, message, requestId: 'req-42', details })
}

describe('authentication routing', () => {
  it('redirects signed-out visitors to the sign-in page and never calls the API', async () => {
    const api = fakeNotesApi([makeNote()])
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{"data":{"status":"ok"}}', { status: 200 })))
    renderApp({ path: '/notes', auth: new DemoAuthService(window.sessionStorage), notesApi: api })
    expect(await screen.findByRole('heading', { name: 'Choose a demo identity' })).toBeInTheDocument()
    expect(screen.getByTestId('demo-banner')).toHaveTextContent('authentication is simulated')
    expect(api.list).not.toHaveBeenCalled()
  })

  it('signs in with a demo identity and returns to the requested page', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{"data":{"status":"ok"}}', { status: 200 })))
    const auth = new DemoAuthService(window.sessionStorage)
    renderApp({ path: '/notes', auth, notesApi: fakeNotesApi([makeNote()]) })
    const button = await screen.findByRole('button', { name: /Continue as Bob/ })
    await waitFor(() => expect(button).toBeEnabled())
    await userEvent.click(button)
    expect(await screen.findByRole('heading', { name: 'Notes', level: 1 })).toBeInTheDocument()
    expect(auth.getSnapshot().user?.id).toBe('demo-user-bob')
  })

  it('says so explicitly when the local backend is down, without offering fake data', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new TypeError('Failed to fetch'))))
    renderApp({ path: '/auth', auth: new DemoAuthService(window.sessionStorage) })
    expect(await screen.findByText(/local backend is not reachable/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Continue as Alice/ })).toBeDisabled()
  })

  it('shows the session-expired notice after the session ends', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{"data":{"status":"ok"}}', { status: 200 })))
    const auth = new DemoAuthService(window.sessionStorage)
    auth.signInAs('alice')
    renderApp({ path: '/', auth })
    await screen.findByRole('heading', { name: 'Welcome, Alice' })
    auth.expireSession()
    expect(await screen.findByText(/session has expired/i)).toBeInTheDocument()
  })
})

describe('Cognito registration (AWS mode)', () => {
  const awsConfig: AwsAppConfig = {
    mode: 'aws',
    apiBaseUrl: 'https://api.example/dev',
    cognito: {
      region: 'eu-central-1',
      userPoolId: 'eu-central-1_Pool',
      clientId: 'client-1',
      domain: 'https://notes.auth.eu-central-1.amazoncognito.com',
      redirectUri: 'http://localhost:5173/auth/callback',
      logoutUri: 'http://localhost:5173/',
      scopes: ['openid', 'notes/read', 'notes/write'],
    },
  }

  function setup() {
    const redirect = vi.fn<(url: string) => void>()
    const auth = new CognitoAuthService({
      config: awsConfig.cognito,
      storage: window.sessionStorage,
      redirect,
      currentPath: () => '/',
    })
    const signUp = vi.spyOn(auth.idp, 'signUp')
    const confirmSignUp = vi.spyOn(auth.idp, 'confirmSignUp')
    renderApp({ path: '/auth', auth, config: awsConfig })
    return { auth, redirect, signUp, confirmSignUp }
  }

  it('validates e-mail, password policy and confirmation before calling Cognito', async () => {
    const { signUp } = setup()
    await userEvent.click(await screen.findByRole('tab', { name: 'Create account' }))
    expect(screen.queryByTestId('demo-banner')).not.toBeInTheDocument()
    await userEvent.type(screen.getByLabelText('E-mail address'), 'not-an-email')
    await userEvent.type(screen.getByLabelText('Password'), 'weak')
    await userEvent.type(screen.getByLabelText('Confirm password'), 'different')
    await userEvent.click(screen.getByRole('button', { name: 'Create account' }))
    expect(screen.getByText('Enter a valid e-mail address.')).toBeInTheDocument()
    expect(screen.getByText('The password does not meet the policy below.')).toBeInTheDocument()
    expect(screen.getByText('The passwords do not match.')).toBeInTheDocument()
    expect(signUp).not.toHaveBeenCalled()

    const policy = screen.getByRole('list', { name: 'Password policy' })
    expect(within(policy).getByText('At least 12 characters').closest('li')).toHaveTextContent('(not met)')
    expect(within(policy).getByText('A lowercase letter').closest('li')).toHaveTextContent('(met)')
  })

  it('toggles password visibility', async () => {
    setup()
    await userEvent.click(await screen.findByRole('tab', { name: 'Create account' }))
    const password = screen.getByLabelText('Password')
    expect(password).toHaveAttribute('type', 'password')
    await userEvent.click(screen.getByRole('button', { name: 'Show password' }))
    expect(password).toHaveAttribute('type', 'text')
  })

  it('registers, verifies the e-mail code and continues to the hosted sign-in', async () => {
    const { signUp, confirmSignUp, redirect } = setup()
    signUp.mockResolvedValue({ userConfirmed: false, codeDestination: 's***@v***.cz' })
    confirmSignUp.mockRejectedValueOnce(new CognitoError('CodeMismatchException', 'That verification code is not correct.'))
    confirmSignUp.mockResolvedValueOnce(undefined)

    await userEvent.click(await screen.findByRole('tab', { name: 'Create account' }))
    await userEvent.type(screen.getByLabelText('E-mail address'), 'student@vut.cz')
    await userEvent.type(screen.getByLabelText('Password'), 'Correct-Horse-9')
    await userEvent.type(screen.getByLabelText('Confirm password'), 'Correct-Horse-9')
    await userEvent.click(screen.getByRole('button', { name: 'Create account' }))
    expect(signUp).toHaveBeenCalledWith('student@vut.cz', 'Correct-Horse-9')

    expect(await screen.findByRole('heading', { name: 'Verify your e-mail' })).toBeInTheDocument()
    expect(screen.getByText(/verification code to s\*\*\*@v\*\*\*\.cz/)).toBeInTheDocument()
    await userEvent.type(screen.getByLabelText('Verification code'), '000000')
    await userEvent.click(screen.getByRole('button', { name: 'Verify e-mail' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('not correct')

    await userEvent.clear(screen.getByLabelText('Verification code'))
    await userEvent.type(screen.getByLabelText('Verification code'), '123456')
    await userEvent.click(screen.getByRole('button', { name: 'Verify e-mail' }))
    expect(await screen.findByRole('heading', { name: 'Account ready' })).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Continue to sign in' }))
    await waitFor(() => expect(redirect).toHaveBeenCalledTimes(1))
    expect(redirect.mock.calls[0]?.[0]).toContain('/oauth2/authorize?')
    expect(redirect.mock.calls[0]?.[0]).toContain('code_challenge_method=S256')
  })
})

describe('dashboard', () => {
  it('shows a loading state, then the notes summary', async () => {
    const api = fakeNotesApi([
      makeNote({ title: 'Older', updatedAt: '2026-01-01T10:00:00.000Z' }),
      makeNote({ noteId: '33333333-3333-4333-8333-333333333333', title: 'Newer', updatedAt: '2026-02-01T10:00:00.000Z' }),
    ])
    renderApp({ path: '/', notesApi: api })
    expect(screen.getByRole('status', { name: 'Loading your notes' })).toBeInTheDocument()
    expect(await screen.findByRole('heading', { name: 'Recently updated' })).toBeInTheDocument()
    const recent = screen.getAllByRole('link', { name: /Older|Newer/ })
    expect(recent[0]).toHaveTextContent('Newer')
    expect(screen.getByText('All of your notes are loaded.')).toBeInTheDocument()
  })

  it('is honest about partially loaded data', async () => {
    const api = fakeNotesApi([makeNote()])
    api.list.mockResolvedValue({ notes: [makeNote()], meta: { count: 1, limit: 1, nextToken: 'more' } })
    renderApp({ path: '/', notesApi: api })
    expect(await screen.findByText('1+')).toBeInTheDocument()
    expect(screen.getByText(/More notes exist than have been loaded/)).toBeInTheDocument()
  })

  it('shows the empty state', async () => {
    renderApp({ path: '/' })
    expect(await screen.findByRole('heading', { name: 'No notes yet' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Create your first note' })).toHaveAttribute('href', '/notes/new')
  })

  it('shows an error with retry, and recovers', async () => {
    const api = fakeNotesApi([makeNote()])
    api.list.mockRejectedValueOnce(httpError(503, 'SERVICE_UNAVAILABLE', 'The service is temporarily unavailable'))
    renderApp({ path: '/', notesApi: api })
    expect(await screen.findByRole('alert')).toHaveTextContent('temporarily unavailable')
    await userEvent.click(screen.getByRole('button', { name: /try again|retry/i }))
    expect(await screen.findByRole('heading', { name: 'Recently updated' })).toBeInTheDocument()
  })
})

describe('notes list', () => {
  it('deletes a note only after confirmation in an accessible dialog', async () => {
    const api = fakeNotesApi([makeNote({ title: 'Delete me' })])
    renderApp({ path: '/notes', notesApi: api })
    await userEvent.click(await screen.findByRole('button', { name: 'Delete note “Delete me”' }))

    const dialog = screen.getByRole('alertdialog', { name: 'Delete this note?' })
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toHaveFocus()
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    expect(api.remove).not.toHaveBeenCalled()
    expect(screen.getByRole('link', { name: 'Delete me' })).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Delete note “Delete me”' }))
    await userEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Delete note' }))
    await waitFor(() => expect(api.remove).toHaveBeenCalledWith(NOTE_ID))
    expect(await screen.findByText('Note deleted')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Delete me' })).not.toBeInTheDocument()
  })

  it('keeps the note and reports the failure when the server refuses the delete', async () => {
    const api = fakeNotesApi([makeNote({ title: 'Keep me' })])
    api.remove.mockRejectedValue(httpError(503, 'SERVICE_UNAVAILABLE', 'The service is temporarily unavailable'))
    renderApp({ path: '/notes', notesApi: api })
    await userEvent.click(await screen.findByRole('button', { name: 'Delete note “Keep me”' }))
    await userEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Delete note' }))
    expect(await screen.findByText(/Could not delete the note/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Keep me' })).toBeInTheDocument()
  })

  it('labels search as applying to loaded notes only and loads more pages', async () => {
    const api = fakeNotesApi()
    api.list
      .mockResolvedValueOnce({ notes: [makeNote({ title: 'Page one' })], meta: { count: 1, limit: 1, nextToken: 'next' } })
      .mockResolvedValueOnce({
        notes: [makeNote({ noteId: '44444444-4444-4444-8444-444444444444', title: 'Page two' })],
        meta: { count: 1, limit: 1, nextToken: null },
      })
    renderApp({ path: '/notes', notesApi: api })
    expect(await screen.findByTestId('notes-scope')).toHaveTextContent('more exist on the server')
    await userEvent.click(screen.getByRole('button', { name: 'Load more' }))
    expect(await screen.findByRole('link', { name: 'Page two' })).toBeInTheDocument()
    expect(api.list).toHaveBeenLastCalledWith({ nextToken: 'next' })
    expect(screen.queryByRole('button', { name: 'Load more' })).not.toBeInTheDocument()

    await userEvent.type(screen.getByRole('searchbox'), 'two')
    expect(screen.getByTestId('notes-scope')).toHaveTextContent('1 of 2 loaded notes match')
    expect(screen.queryByRole('link', { name: 'Page one' })).not.toBeInTheDocument()
  })
})

describe('note editor', () => {
  it('validates on the client and does not call the API with invalid input', async () => {
    const api = fakeNotesApi()
    renderApp({ path: '/notes/new', notesApi: api })
    await userEvent.click(await screen.findByRole('button', { name: 'Create note' }))
    const title = screen.getByLabelText(/^Title/)
    expect(title).toHaveAttribute('aria-invalid', 'true')
    expect(title).toHaveAccessibleDescription(/Enter a title\./)
    expect(title).toHaveFocus()
    expect(api.create).not.toHaveBeenCalled()
  })

  it('creates a note with a trimmed title and navigates to it', async () => {
    const api = fakeNotesApi()
    const { router } = renderApp({ path: '/notes/new', notesApi: api })
    await userEvent.type(await screen.findByLabelText(/^Title/), '  Fresh note  ')
    await userEvent.type(screen.getByLabelText(/^Content/), 'Body')
    expect(screen.getByText('Unsaved changes')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Create note' }))
    await waitFor(() => expect(api.create).toHaveBeenCalledWith({ title: 'Fresh note', content: 'Body' }))
    expect(await screen.findByText('Note created')).toBeInTheDocument()
    await waitFor(() => expect(router.state.location.pathname).toBe('/notes/22222222-2222-4222-8222-222222222222'))
  })

  it('sends the version when saving and handles Ctrl+S', async () => {
    const api = fakeNotesApi([makeNote({ version: 3 })])
    renderApp({ path: `/notes/${NOTE_ID}`, notesApi: api })
    const title = await screen.findByLabelText(/^Title/)
    expect(title).toHaveValue('First note')
    await userEvent.clear(title)
    await userEvent.type(title, 'Renamed')
    await userEvent.keyboard('{Control>}s{/Control}')
    await waitFor(() =>
      expect(api.update).toHaveBeenCalledWith(NOTE_ID, { title: 'Renamed', content: 'Some content', version: 3 }),
    )
    expect(await screen.findByText('Note saved')).toBeInTheDocument()
    expect(screen.getByText('All changes saved')).toBeInTheDocument()
  })

  it('explains a version conflict and blocks further overwrites', async () => {
    const api = fakeNotesApi([makeNote()])
    api.update.mockRejectedValue(httpError(409, 'VERSION_CONFLICT', 'The note was modified by another request'))
    renderApp({ path: `/notes/${NOTE_ID}`, notesApi: api })
    await userEvent.type(await screen.findByLabelText(/^Content/), ' more')
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }))
    expect(await screen.findByText(/changed somewhere else/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled()

    await userEvent.click(screen.getByRole('button', { name: /load the latest version/i }))
    await waitFor(() => expect(api.get).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(screen.getByLabelText(/^Content/)).toHaveValue('Some content'))
  })

  it('shows server-side validation errors next to the field', async () => {
    const api = fakeNotesApi()
    api.create.mockRejectedValue(
      httpError(400, 'VALIDATION_ERROR', 'The title field must not contain control characters', [
        { field: 'title', issue: 'must not contain control characters' },
      ]),
    )
    renderApp({ path: '/notes/new', notesApi: api })
    await userEvent.type(await screen.findByLabelText(/^Title/), 'x')
    await userEvent.click(screen.getByRole('button', { name: 'Create note' }))
    expect(await screen.findByText('The title must not contain control characters.')).toBeInTheDocument()
  })

  it.each([
    [403, 'FORBIDDEN', 'This note belongs to another account'],
    [404, 'NOT_FOUND', 'This note does not exist'],
  ])('shows a clear state for %s without leaking content', async (status, code, heading) => {
    const api = fakeNotesApi()
    api.get.mockRejectedValue(httpError(status, code, 'nope'))
    renderApp({ path: `/notes/${NOTE_ID}`, notesApi: api })
    expect(await screen.findByRole('heading', { name: heading })).toBeInTheDocument()
    expect(screen.queryByLabelText(/^Title/)).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Back to your notes' })).toBeInTheDocument()
  })

  it('reports unexpected save failures with the request id', async () => {
    const api = fakeNotesApi()
    api.create.mockRejectedValue(httpError(500, 'INTERNAL_ERROR', 'An unexpected error occurred'))
    renderApp({ path: '/notes/new', notesApi: api })
    await userEvent.type(await screen.findByLabelText(/^Title/), 'x')
    await userEvent.click(screen.getByRole('button', { name: 'Create note' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('An unexpected error occurred (request req-42)')
    expect(screen.queryByText('Note created')).not.toBeInTheDocument()
  })
})

describe('other pages', () => {
  it('settings shows account and environment without any token', async () => {
    renderApp({ path: '/settings', config: DEMO_CONFIG })
    expect(await screen.findByText('alice@demo.local')).toBeInTheDocument()
    expect(screen.getByText('demo-user-alice')).toBeInTheDocument()
    expect(screen.getByText(DEMO_CONFIG.apiBaseUrl)).toBeInTheDocument()
    await userEvent.click(screen.getByLabelText('Dark'))
    expect(document.documentElement).toHaveClass('dark')
  })

  it('architecture explorer selects components and steps through the walkthrough', async () => {
    renderApp({ path: '/architecture' })
    const lambda = await screen.findByRole('button', { name: /AWS Lambda/ })
    await userEvent.click(lambda)
    expect(lambda).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByTestId('component-detail')).toHaveTextContent('CreateNote, ListNotes, GetNote, UpdateNote and DeleteNote')
    await userEvent.click(screen.getByRole('button', { name: 'Start' }))
    expect(screen.getByTestId('walkthrough-step')).toHaveTextContent('Step 1 of 9')
    expect(screen.getByRole('button', { name: /Amazon Cognito/ })).toHaveAttribute('aria-pressed', 'true')
  })

  it('unknown routes show a not-found page', async () => {
    renderApp({ path: '/does-not-exist' })
    expect(await screen.findByRole('heading', { name: 'Page not found' })).toBeInTheDocument()
  })
})
