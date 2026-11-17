import { CheckCircle2, CircleAlert, Info, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { ToastContext, type ToastApi, type ToastTone } from '../../hooks/useToast'
import { cx } from '../../utils/cx'

interface ToastItem {
  id: number
  message: string
  tone: ToastTone
}

const DISMISS_AFTER_MS = 5000

const ICONS: Record<ToastTone, ReactNode> = {
  success: <CheckCircle2 className="size-4 text-success-ink" aria-hidden="true" />,
  error: <CircleAlert className="size-4 text-danger-ink" aria-hidden="true" />,
  info: <Info className="size-4 text-accent-ink" aria-hidden="true" />,
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const nextId = useRef(1)
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>())

  const dismiss = useCallback((id: number) => {
    const timer = timers.current.get(id)
    if (timer) clearTimeout(timer)
    timers.current.delete(id)
    setToasts((current) => current.filter((toast) => toast.id !== id))
  }, [])

  const show = useCallback(
    (message: string, tone: ToastTone = 'info') => {
      const id = nextId.current++
      setToasts((current) => [...current.slice(-2), { id, message, tone }])
      timers.current.set(
        id,
        setTimeout(() => dismiss(id), DISMISS_AFTER_MS),
      )
    },
    [dismiss],
  )

  useEffect(() => {
    const pending = timers.current
    return () => {
      for (const timer of pending.values()) clearTimeout(timer)
      pending.clear()
    }
  }, [])

  const api = useMemo<ToastApi>(
    () => ({
      show,
      success: (message) => show(message, 'success'),
      error: (message) => show(message, 'error'),
    }),
    [show],
  )

  return (
    <ToastContext.Provider value={api}>
      {children}
      {/* The live region is always in the DOM so screen readers announce added toasts. */}
      <div
        role="region"
        aria-label="Notifications"
        className="pointer-events-none fixed inset-x-0 print:hidden bottom-20 z-[60] flex flex-col items-center gap-2 px-4 md:inset-x-auto md:right-6 md:bottom-6 md:items-end md:px-0"
      >
        <div aria-live="polite" aria-atomic="false" className="flex flex-col items-center gap-2 md:items-end">
          {toasts.map((toast) => (
            <div
              key={toast.id}
              data-tone={toast.tone}
              className={cx(
                'pointer-events-auto flex w-full max-w-sm items-start gap-2.5 rounded-lg border border-line bg-surface py-2.5 pr-2 pl-3 text-sm text-fg shadow-pop animate-toast-in',
              )}
            >
              <span className="mt-0.5 shrink-0">{ICONS[toast.tone]}</span>
              <p className="min-w-0 flex-1">{toast.message}</p>
              <button
                type="button"
                onClick={() => dismiss(toast.id)}
                className="shrink-0 rounded-sm p-1 text-muted hover:bg-subtle hover:text-fg"
                aria-label="Dismiss notification"
              >
                <X className="size-3.5" aria-hidden="true" />
              </button>
            </div>
          ))}
        </div>
      </div>
    </ToastContext.Provider>
  )
}
