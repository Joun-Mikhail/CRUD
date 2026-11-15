/// <reference types="vite/client" />

declare const __APP_VERSION__: string

interface ImportMetaEnv {
  readonly VITE_APP_MODE?: string
  readonly VITE_API_BASE_URL?: string
  readonly VITE_AWS_REGION?: string
  readonly VITE_COGNITO_USER_POOL_ID?: string
  readonly VITE_COGNITO_CLIENT_ID?: string
  readonly VITE_COGNITO_DOMAIN?: string
  readonly VITE_OAUTH_REDIRECT_URI?: string
  readonly VITE_OAUTH_LOGOUT_URI?: string
  readonly VITE_OAUTH_SCOPES?: string
}
