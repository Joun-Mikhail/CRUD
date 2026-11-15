import { TriangleAlert } from 'lucide-react'

export function ConfigErrorPage({ mode, problems }: { mode: string | null; problems: string[] }) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col justify-center px-6 py-12">
      <div role="alert" className="rounded-lg border border-line bg-surface p-6 shadow-card">
        <div className="mb-3 flex items-center gap-2 text-danger-ink">
          <TriangleAlert aria-hidden="true" className="size-5" />
          <h1 className="text-lg font-semibold text-fg">Configuration error</h1>
        </div>
        <p className="text-sm text-muted">
          The application cannot start{mode ? ` in "${mode}" mode` : ''} because its configuration is
          incomplete. It will not fall back to another mode on its own.
        </p>
        <ul className="mt-4 list-disc space-y-1 pl-5 text-sm text-fg">
          {problems.map((problem) => (
            <li key={problem}>{problem}</li>
          ))}
        </ul>
        <p className="mt-4 text-sm text-muted">
          For the Local Demo run <code className="rounded-sm bg-subtle px-1 py-0.5">npm run dev</code>. For AWS,
          generate <code className="rounded-sm bg-subtle px-1 py-0.5">frontend/.env.aws</code> with{' '}
          <code className="rounded-sm bg-subtle px-1 py-0.5">make frontend-env</code> and run{' '}
          <code className="rounded-sm bg-subtle px-1 py-0.5">npm run dev:aws</code>.
        </p>
      </div>
    </main>
  )
}
