import { FlaskConical, LayoutDashboard, LogOut, Menu, Network, Settings, StickyNote, Terminal, X } from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router'
import { Logo } from '../components/Logo'
import { DemoBanner, ModeBadge } from '../components/ModeBadge'
import { Button } from '../components/ui/Button'
import { useAuth } from '../hooks/useAuth'
import { cx } from '../utils/cx'

const NAV = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/notes', label: 'Notes', icon: StickyNote, end: false },
  { to: '/lab', label: 'LabProof', icon: FlaskConical, end: false },
  { to: '/architecture', label: 'Architecture', icon: Network, end: false },
  { to: '/api-explorer', label: 'API explorer', icon: Terminal, end: false },
  { to: '/settings', label: 'Settings', icon: Settings, end: false },
] as const

function NavItems({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <ul className="flex flex-col gap-0.5">
      {NAV.map(({ to, label, icon: Icon, end }) => (
        <li key={to}>
          <NavLink
            to={to}
            end={end}
            onClick={onNavigate}
            className={({ isActive }) =>
              cx(
                'flex h-10 items-center gap-2.5 rounded-md px-2.5 text-sm font-medium transition-colors',
                isActive ? 'bg-accent-soft text-accent-ink' : 'text-muted hover:bg-subtle hover:text-fg',
              )
            }
          >
            <Icon aria-hidden="true" className="size-4 shrink-0" />
            {label}
          </NavLink>
        </li>
      ))}
    </ul>
  )
}

function AccountMenu() {
  const { user, service } = useAuth()
  const [open, setOpen] = useState(false)
  const container = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onPointer = (event: PointerEvent) => {
      if (!container.current?.contains(event.target as Node)) setOpen(false)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  if (!user) return null
  const initial = user.displayName.charAt(0).toUpperCase()
  return (
    <div ref={container} className="relative">
      <button
        type="button"
        aria-haspopup="true"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="flex h-9 items-center gap-2 rounded-md border border-line-strong bg-surface pr-2.5 pl-1 text-sm hover:bg-subtle"
      >
        <span
          aria-hidden="true"
          className="flex size-7 items-center justify-center rounded-sm bg-accent text-xs font-semibold text-accent-fg"
        >
          {initial}
        </span>
        {/* The name is always part of the accessible name; it is only visually hidden on small screens. */}
        <span className="sr-only max-w-40 truncate sm:not-sr-only">{user.displayName}</span>
        <span className="sr-only">account menu</span>
      </button>
      {open ? (
        <div className="absolute right-0 z-30 mt-2 w-64 rounded-lg border border-line bg-surface p-2 shadow-card">
          <div className="border-b border-line px-2 pt-1 pb-2.5">
            <p className="truncate text-sm font-medium text-fg">{user.displayName}</p>
            <p className="truncate text-xs text-muted">{user.email}</p>
          </div>
          <div className="flex flex-col gap-0.5 pt-2">
            <NavLink
              to="/settings"
              onClick={() => setOpen(false)}
              className="flex h-9 items-center gap-2 rounded-md px-2 text-sm text-fg hover:bg-subtle"
            >
              <Settings aria-hidden="true" className="size-4 text-muted" />
              {service.mode === 'demo' ? 'Settings & switch identity' : 'Settings'}
            </NavLink>
            <button
              type="button"
              onClick={() => void service.signOut()}
              className="flex h-9 items-center gap-2 rounded-md px-2 text-left text-sm text-fg hover:bg-subtle"
            >
              <LogOut aria-hidden="true" className="size-4 text-muted" />
              Sign out
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}

function MobileDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const closeButton = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (!open) return
    closeButton.current?.focus()
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null
  return (
    <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Navigation">
      <div className="absolute inset-0 bg-overlay" onClick={onClose} aria-hidden="true" />
      <div className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col border-r border-line bg-surface p-3">
        <div className="mb-4 flex items-center justify-between pl-1.5">
          <Logo />
          <Button ref={closeButton} variant="ghost" size="sm" onClick={onClose} aria-label="Close navigation">
            <X aria-hidden="true" className="size-4" />
          </Button>
        </div>
        <nav aria-label="Main">
          <NavItems onNavigate={onClose} />
        </nav>
      </div>
    </div>
  )
}

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string
  description?: ReactNode
  actions?: ReactNode
}) {
  return (
    <header className="mb-6 flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
      <div className="min-w-0">
        <h1 className="text-xl font-semibold tracking-tight text-fg sm:text-2xl">{title}</h1>
        {description ? <p className="mt-1 max-w-2xl text-sm text-muted">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  )
}

export function AppLayout() {
  const [drawerOpen, setDrawerOpen] = useState(false)
  const location = useLocation()
  const main = useRef<HTMLElement>(null)

  useEffect(() => {
    main.current?.scrollTo?.({ top: 0 })
  }, [location.pathname])

  return (
    <div className="flex min-h-dvh flex-col bg-canvas">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-surface focus:px-3 focus:py-2 focus:text-sm focus:shadow-card"
      >
        Skip to content
      </a>
      {/* print:hidden — printing a lab report prints only the report, not the app chrome. */}
      <div className="print:hidden">
        <DemoBanner />
      </div>
      <div className="flex min-h-0 flex-1">
        <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r border-line bg-surface p-3 lg:flex print:hidden">
          <div className="mb-5 px-1.5 pt-1.5">
            <Logo />
          </div>
          <nav aria-label="Main">
            <NavItems />
          </nav>
          <p className="mt-auto px-2 text-xs text-faint">
            Bachelor thesis reference implementation · v{__APP_VERSION__}
          </p>
        </aside>
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-line bg-canvas/90 px-4 backdrop-blur sm:px-6 print:hidden">
            <Button
              variant="ghost"
              size="sm"
              className="lg:hidden"
              onClick={() => setDrawerOpen(true)}
              aria-label="Open navigation"
            >
              <Menu aria-hidden="true" className="size-5" />
            </Button>
            <Logo className="whitespace-nowrap lg:hidden" />
            <div className="ml-auto flex items-center gap-3">
              {/* Below sm the full-width demo banner already states the mode. */}
              <span className="hidden sm:inline-flex">
                <ModeBadge />
              </span>
              <AccountMenu />
            </div>
          </div>
          <main id="main" ref={main} tabIndex={-1} className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6 sm:py-8 print:max-w-none print:p-0">
            <Outlet />
          </main>
        </div>
      </div>
      <MobileDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} />
    </div>
  )
}

