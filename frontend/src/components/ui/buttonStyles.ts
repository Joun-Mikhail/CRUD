import { cx } from '../../utils/cx'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'inverse'
export type ButtonSize = 'sm' | 'md'

const VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-accent text-accent-fg hover:bg-accent-hover border border-transparent',
  secondary: 'bg-surface text-fg border border-line-strong hover:bg-subtle',
  ghost: 'bg-transparent text-muted border border-transparent hover:bg-subtle hover:text-fg',
  danger: 'bg-danger text-danger-fg hover:bg-danger-hover border border-transparent',
  /** White button for dark (navy) hero panels. */
  inverse: 'bg-white text-navy hover:bg-blue-50 border border-transparent',
}

const SIZES: Record<ButtonSize, string> = {
  sm: 'h-8 px-2.5 text-[0.8125rem] gap-1.5',
  md: 'h-10 px-4 text-sm gap-2',
}

/** Shared by <Button> and links styled as buttons. */
export function buttonClasses(
  variant: ButtonVariant = 'secondary',
  size: ButtonSize = 'md',
  className?: string,
): string {
  return cx(
    'inline-flex shrink-0 items-center justify-center rounded-md font-medium whitespace-nowrap select-none',
    'transition-colors duration-150 disabled:opacity-55 aria-disabled:opacity-55',
    VARIANTS[variant],
    SIZES[size],
    className,
  )
}
