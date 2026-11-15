import { cx } from '../../utils/cx'

/** Decorative placeholder; wrap groups in an element with role="status" and a label. */
export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden="true" className={cx('animate-pulse rounded-md bg-subtle', className)} />
}
