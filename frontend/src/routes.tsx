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
import { ExperimentEditorPage } from './pages/lab/ExperimentEditorPage'
import { LabHomePage } from './pages/lab/LabHomePage'
import { LabReportPage } from './pages/lab/LabReportPage'
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
      { path: '/lab', element: <LabHomePage /> },
      { path: '/lab/new', element: <ExperimentEditorPage key="new" /> },
      { path: '/lab/:noteId', element: <ExperimentEditorPage /> },
      { path: '/lab/:noteId/report', element: <LabReportPage /> },
      { path: '/architecture', element: <ArchitecturePage /> },
      { path: '/api-explorer', element: <ApiExplorerPage /> },
      { path: '/settings', element: <SettingsPage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
]
