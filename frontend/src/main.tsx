import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { createBrowserRouter, RouterProvider } from 'react-router'
import { AppProviders } from './components/providers/AppProviders'
import { loadConfig } from './config'
import { ConfigErrorPage } from './pages/ConfigErrorPage'
import { routes } from './routes'
import { createAuthService } from './services/auth/createAuthService'
import './styles/index.css'

const container = document.getElementById('root')
if (!container) throw new Error('Missing #root element')
const root = createRoot(container)

const result = loadConfig(import.meta.env, window.location.origin)
if (!result.ok) {
  // Never fall back to another mode silently: a broken configuration must be visible.
  root.render(
    <StrictMode>
      <ConfigErrorPage mode={result.mode} problems={result.problems} />
    </StrictMode>,
  )
} else {
  const auth = createAuthService(result.config)
  const router = createBrowserRouter(routes)
  root.render(
    <StrictMode>
      <AppProviders config={result.config} auth={auth}>
        <RouterProvider router={router} />
      </AppProviders>
    </StrictMode>,
  )
}
