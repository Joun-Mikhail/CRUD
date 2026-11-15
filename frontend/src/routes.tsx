import type { RouteObject } from 'react-router'
import { RequireAuth } from './layouts/RequireAuth'
import { ApiExplorerPage } from './pages/ApiExplorerPage'
import { ArchitecturePage } from './pages/ArchitecturePage'
import { AuthCallbackPage } from './pages/AuthCallbackPage'
import { AuthPage } from './pages/AuthPage'
import { DashboardPage } from './pages/DashboardPage'
import { NoteEditorPage } from './pages/NoteEditorPage'
import { NotesPage } from './pages/NotesPage'
import { NotFoundPage } from './pages/NotFoundPage'
import { SettingsPage } from './pages/SettingsPage'

export const routes: RouteObject[] = [
  { path: '/auth', element: <AuthPage /> },
  { path: '/auth/callback', element: <AuthCallbackPage /> },
  {
    element: <RequireAuth />,
    children: [
      { path: '/', element: <DashboardPage /> },
      { path: '/notes', element: <NotesPage /> },
      { path: '/notes/new', element: <NoteEditorPage key="new" /> },
      { path: '/notes/:noteId', element: <NoteEditorPage /> },
      { path: '/architecture', element: <ArchitecturePage /> },
      { path: '/api-explorer', element: <ApiExplorerPage /> },
      { path: '/settings', element: <SettingsPage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
]
