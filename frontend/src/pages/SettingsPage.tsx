import { LogOut } from 'lucide-react'
import type { ReactNode } from 'react'
import { ModeBadge } from '../components/ModeBadge'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { useAuth } from '../hooks/useAuth'
import { useConfig } from '../hooks/useConfig'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { useTheme, type ThemePreference } from '../hooks/useTheme'
import { PageHeader } from '../layouts/AppLayout'
import { DEMO_IDENTITIES, DemoAuthService } from '../services/auth/demoAuth'
import { cx } from '../utils/cx'
import { formatDateTime } from '../utils/format'

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-1 py-2.5 sm:grid-cols-[11rem_minmax(0,1fr)] sm:gap-4">
      <dt className="text-sm text-muted">{label}</dt>
      <dd className="min-w-0 text-sm break-words text-fg">{children}</dd>
    </div>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card className="p-4 sm:p-6">
      <h2 className="mb-2 text-base font-semibold text-fg">{title}</h2>
      {children}
    </Card>
  )
}

const THEMES: { value: ThemePreference; label: string }[] = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
]

export function SettingsPage() {
  useDocumentTitle('Settings')
  const { user, service, expiresAt } = useAuth()
  const config = useConfig()
  const theme = useTheme()

  return (
    <>
      <PageHeader title="Settings" description="Your account, appearance and the environment this app is connected to." />
      <div className="flex max-w-3xl flex-col gap-6">
        <Section title="Account">
          <dl className="divide-y divide-line">
            <Row label="Name">{user?.displayName}</Row>
            <Row label="E-mail">{user?.email}</Row>
            <Row label="User id (sub)">
              <code className="font-mono text-xs">{user?.id}</code>
            </Row>
            <Row label="Authentication">
              {config.mode === 'demo'
                ? 'Simulated demo identity (no password, no token)'
                : 'Amazon Cognito — OAuth 2.0 Authorization Code with PKCE'}
            </Row>
            {expiresAt ? (
              <Row label="Access token expires">
                {formatDateTime(new Date(expiresAt).toISOString())} — renewed automatically while this tab is open.
                The token itself is kept in memory only and is never displayed.
              </Row>
            ) : null}
          </dl>
          <Button
            className="mt-4"
            icon={<LogOut aria-hidden="true" className="size-4" />}
            onClick={() => void service.signOut()}
          >
            Sign out
          </Button>
        </Section>

        {service instanceof DemoAuthService ? (
          <Section title="Switch demo identity">
            <p className="mb-3 text-sm text-muted">
              Switch to another simulated user to see that each one only ever receives their own notes.
            </p>
            <div className="flex flex-wrap gap-2">
              {DEMO_IDENTITIES.map((identity) => (
                <Button
                  key={identity.name}
                  aria-pressed={user?.id === identity.id}
                  variant={user?.id === identity.id ? 'primary' : 'secondary'}
                  onClick={() => service.signInAs(identity.name)}
                >
                  {identity.displayName}
                </Button>
              ))}
            </div>
          </Section>
        ) : null}

        <Section title="Appearance">
          <fieldset>
            <legend className="mb-2 text-sm text-muted">Theme</legend>
            <div className="flex flex-wrap gap-2">
              {THEMES.map(({ value, label }) => (
                <label
                  key={value}
                  className={cx(
                    'flex h-10 cursor-pointer items-center gap-2 rounded-md border px-3 text-sm',
                    theme.preference === value ? 'border-accent bg-accent-soft text-accent-ink' : 'border-line-strong text-fg hover:bg-subtle',
                  )}
                >
                  <input
                    type="radio"
                    name="theme"
                    value={value}
                    checked={theme.preference === value}
                    onChange={() => theme.setPreference(value)}
                    className="size-4 accent-(--accent)"
                  />
                  {label}
                </label>
              ))}
            </div>
          </fieldset>
        </Section>

        <Section title="Environment">
          <dl className="divide-y divide-line">
            <Row label="Mode">
              <ModeBadge />
            </Row>
            <Row label="API base URL">
              <code className="font-mono text-xs">{config.apiBaseUrl}</code>
            </Row>
            {config.mode === 'aws' ? (
              <>
                <Row label="AWS region">{config.cognito.region}</Row>
                <Row label="Cognito user pool">
                  <code className="font-mono text-xs">{config.cognito.userPoolId}</code>
                </Row>
              </>
            ) : (
              <Row label="Data storage">In-memory DynamoDB emulator — cleared when the local backend stops</Row>
            )}
            <Row label="App version">{__APP_VERSION__}</Row>
          </dl>
        </Section>
      </div>
    </>
  )
}
