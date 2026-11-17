import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { defineConfig, devices } from '@playwright/test'

// The virtual environment's interpreter lives in bin/ on Linux/macOS and Scripts/ on Windows.
// Resolved to an absolute path because cmd.exe cannot run a relative path that starts with '..'.
const venvPythons = ['../backend/.venv/bin/python', '../backend/.venv/Scripts/python.exe'].map((p) => resolve(p))
const venvPython = venvPythons.find((candidate) => existsSync(candidate))
const python = venvPython ? `"${venvPython}"` : 'python'
// Cloud/CI images may ship Chromium outside Playwright's default cache.
const chromiumPath = process.env.PW_CHROMIUM_PATH ?? (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined)
const launchOptions = chromiumPath && !process.env.CI ? { executablePath: chromiumPath } : {}

export default defineConfig({
  testDir: './tests/e2e',
  // One shared in-memory backend: tests reset it, so they must not run in parallel.
  workers: 1,
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : [['list']],
  timeout: 30_000,
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'off',
    launchOptions,
  },
  projects: [
    {
      name: 'chromium',
      testIgnore: /screenshots\.spec\.ts/,
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 }, launchOptions },
    },
    {
      name: 'screenshots',
      testMatch: /screenshots\.spec\.ts/,
      use: { ...devices['Desktop Chrome'], deviceScaleFactor: 2, launchOptions },
    },
  ],
  webServer: [
    {
      command: `${python} -m local_demo.server --port 8787 --seed`,
      cwd: '../backend',
      env: { PYTHONPATH: 'src' },
      url: 'http://127.0.0.1:8787/health',
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
    {
      command: 'npm run dev',
      url: 'http://localhost:5173',
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
  ],
})
