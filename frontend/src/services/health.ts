import type { ApiClient } from './apiClient'

/** Local Demo only: `GET /health` of backend/local_demo/server.py (no authentication). */
export async function checkDemoBackend(client: ApiClient, signal?: AbortSignal): Promise<void> {
  await client.request({ method: 'GET', path: '/health', auth: 'none', signal })
}

export const DEMO_BACKEND_COMMAND =
  'cd backend && PYTHONPATH=src .venv/bin/python -m local_demo.server --port 8787 --seed'
