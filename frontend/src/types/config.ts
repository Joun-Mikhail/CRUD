export type AppMode = 'demo' | 'aws'

export interface CognitoConfig {
  region: string
  userPoolId: string
  clientId: string
  /** Hosted UI base URL, e.g. https://xxx.auth.eu-north-1.amazoncognito.com (no trailing slash) */
  domain: string
  redirectUri: string
  logoutUri: string
  scopes: string[]
}

export interface DemoAppConfig {
  mode: 'demo'
  apiBaseUrl: string
}

export interface AwsAppConfig {
  mode: 'aws'
  apiBaseUrl: string
  cognito: CognitoConfig
}

export type AppConfig = DemoAppConfig | AwsAppConfig

export type ConfigResult =
  | { ok: true; config: AppConfig }
  | { ok: false; mode: string | null; problems: string[] }
