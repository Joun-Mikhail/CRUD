import { readFileSync } from 'node:fs'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { loadEnv, type Plugin, type ProxyOptions } from 'vite'
import { defineConfig } from 'vitest/config'
import { buildCsp } from './csp.ts'

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as {
  version: string
}

/** Injects the generated Content-Security-Policy <meta> tag into index.html. */
function cspPlugin(env: Record<string, string>): Plugin {
  let dev = false
  return {
    name: 'serverless-notes-csp',
    configResolved(config) {
      dev = config.command === 'serve' && !config.isProduction
    },
    transformIndexHtml() {
      return [
        {
          tag: 'meta',
          attrs: { 'http-equiv': 'Content-Security-Policy', content: buildCsp(env, { dev }) },
          injectTo: 'head-prepend',
        },
      ]
    },
  }
}

/**
 * Dev-server only: forwards http://localhost:5173/api/* to the deployed API stage
 * (DEV_API_PROXY_TARGET, written by scripts/deployment/write_frontend_env.py). The browser
 * sees same-origin requests, so `npm run dev:aws` keeps working while the API's CORS origin
 * is the hosted CloudFront URL. Never part of a production build.
 */
function apiProxy(target: string | undefined): Record<string, ProxyOptions> | undefined {
  if (!target) return undefined
  return {
    '/api': {
      target,
      changeOrigin: true,
      secure: true,
      rewrite: (path) => path.replace(/^\/api/, ''),
    },
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_')
  const devProxyTarget = loadEnv(mode, process.cwd(), 'DEV_').DEV_API_PROXY_TARGET
  return {
    plugins: [react(), tailwindcss(), cspPlugin(env)],
    define: { __APP_VERSION__: JSON.stringify(pkg.version) },
    server: { host: 'localhost', port: 5173, strictPort: true, proxy: apiProxy(devProxyTarget) },
    preview: { host: 'localhost', port: 4173, strictPort: true },
    build: { sourcemap: false, target: 'es2022' },
    test: {
      environment: 'jsdom',
      globals: true,
      setupFiles: ['./src/test/setup.ts'],
      include: ['src/**/*.test.{ts,tsx}'],
      css: false,
      restoreMocks: true,
    },
  }
})
