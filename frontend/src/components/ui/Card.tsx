import type { HTMLAttributes } from 'react'
import { cx } from '../../utils/cx'

export function Card({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cx('rounded-lg border border-line bg-surface shadow-card', className)} {...rest} />
}
