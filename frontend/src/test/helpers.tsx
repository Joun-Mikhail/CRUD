import { render, type RenderResult } from '@testing-library/react'
import { createMemoryRouter, RouterProvider, type RouteObject } from 'react-router'
import { vi } from 'vitest'
import { AppProviders } from '../components/providers/AppProviders'
import { routes } from '../routes'
import { DemoAuthService } from '../services/auth/demoAuth'
import type { AuthService } from '../services/auth/types'
import type { NotesApi } from '../services/notesApi'
import type { Note } from '../types/api'
import type { AppConfig } from '../types/config'

export const DEMO_CONFIG: AppConfig = { mode: 'demo', apiBaseUrl: 'http://127.0.0.1:8787' }

export function makeNote(overrides: Partial<Note> = {}): Note {
  return {
    noteId: '11111111-1111-4111-8111-111111111111',
    userId: 'demo-user-alice',
    title: 'First note',
    content: 'Some content',
    createdAt: '2026-01-01T10:00:00.000Z',
    updatedAt: '2026-01-01T10:00:00.000Z',
    version: 1,
    ...overrides,
  }
}

export type FakeNotesApi = { [K in keyof NotesApi]: ReturnType<typeof vi.fn<NotesApi[K]>> }

/** In-memory NotesApi double; every method is a spy that tests can override. */
export function fakeNotesApi(initial: Note[] = []): FakeNotesApi {
  const store = [...initial]
  return {
    list: vi.fn<NotesApi['list']>(async () => ({
      notes: [...store],
      meta: { count: store.length, limit: 20, nextToken: null },
    })),
    get: vi.fn<NotesApi['get']>(async (noteId) => {
      const note = store.find((item) => item.noteId === noteId)
      if (!note) throw new Error('not found in fake')
      return note
    }),
    create: vi.fn<NotesApi['create']>(async (input) => {
      const note = makeNote({ ...input, noteId: '22222222-2222-4222-8222-222222222222' })
      store.unshift(note)
      return note
    }),
    update: vi.fn<NotesApi['update']>(async (noteId, input) => {
      const index = store.findIndex((item) => item.noteId === noteId)
      const current = store[index] ?? makeNote({ noteId })
      const note = { ...current, title: input.title, content: input.content, version: current.version + 1 }
      store[index] = note
      return note
    }),
    remove: vi.fn<NotesApi['remove']>(async (noteId) => {
      const index = store.findIndex((item) => item.noteId === noteId)
      if (index >= 0) store.splice(index, 1)
      return { noteId, deleted: true as const }
    }),
  }
}

export function signedInDemoAuth(name: 'alice' | 'bob' = 'alice'): DemoAuthService {
  const auth = new DemoAuthService(window.sessionStorage)
  auth.signInAs(name)
  return auth
}

export function renderApp(options: {
  path?: string
  auth?: AuthService
  notesApi?: NotesApi
  config?: AppConfig
  appRoutes?: RouteObject[]
}): RenderResult & { router: ReturnType<typeof createMemoryRouter> } {
  const router = createMemoryRouter(options.appRoutes ?? routes, { initialEntries: [options.path ?? '/'] })
  const result = render(
    <AppProviders
      config={options.config ?? DEMO_CONFIG}
      auth={options.auth ?? signedInDemoAuth()}
      notesApi={options.notesApi ?? fakeNotesApi()}
    >
      <RouterProvider router={router} />
    </AppProviders>,
  )
  return { ...result, router }
}
