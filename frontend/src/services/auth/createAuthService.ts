import type { AppConfig } from '../../types/config'
import { CognitoAuthService } from './cognitoAuth'
import { DemoAuthService } from './demoAuth'
import type { AuthService } from './types'

export function createAuthService(config: AppConfig): AuthService {
  if (config.mode === 'demo') return new DemoAuthService(window.sessionStorage)
  return new CognitoAuthService({
    config: config.cognito,
    storage: window.sessionStorage,
    redirect: (url) => window.location.assign(url),
    currentPath: () => window.location.pathname + window.location.search,
  })
}
