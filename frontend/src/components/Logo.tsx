import { cx } from '../utils/cx'

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cx('inline-flex items-center gap-2 font-semibold tracking-tight text-fg', className)}>
      <svg viewBox="0 0 24 24" aria-hidden="true" className="size-6 shrink-0">
        <rect width="24" height="24" rx="6" className="fill-accent" />
        <path
          d="M7 8h10M7 12h10M7 16h6"
          className="stroke-accent-fg"
          strokeWidth="2"
          strokeLinecap="round"
          fill="none"
        />
      </svg>
      Serverless Notes
    </span>
  )
}
