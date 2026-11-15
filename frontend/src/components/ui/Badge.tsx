import type { ReactNode } from 'react'
import { cx } from '../../utils/cx'

export type BadgeTone = 'neutral' | 'accent' | 'warning' | 'danger' | 'success'

const TONES: Record<BadgeTone, string> = {
  neutral: 'bg-subtle text-muted border-line',
  accent: 'bg-accent-soft text-accent-ink border-transparent',
  warning: 'bg-warning-soft text-warning-ink border-transparent',
  danger: 'bg-danger-soft text-danger-ink border-transparent',
  success: 'bg-success-soft text-success-ink border-transparent',
}

export function Badge({
  tone = 'neutral',
  className,
  children,
}: {
  tone?: BadgeTone
  className?: string
  children: ReactNode
}) {
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1 rounded-sm border px-1.5 py-0.5 text-xs leading-4 font-medium whitespace-nowrap',
        TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  )
}
