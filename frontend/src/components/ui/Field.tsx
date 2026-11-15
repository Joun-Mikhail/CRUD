import { useId, type InputHTMLAttributes, type ReactNode, type Ref, type TextareaHTMLAttributes } from 'react'
import { cx } from '../../utils/cx'

interface FieldChrome {
  label: string
  /** Visually hides the label (it stays available to assistive technology). */
  hideLabel?: boolean
  hint?: ReactNode
  error?: string | null
  /** Rendered right-aligned under the control, e.g. a character counter. */
  counter?: ReactNode
  /** Rendered inside the control's right edge, e.g. a show/hide password button. */
  trailing?: ReactNode
  containerClassName?: string
}

const CONTROL =
  'w-full rounded-md border bg-surface px-3 text-sm text-fg placeholder:text-faint ' +
  'transition-colors duration-150 disabled:opacity-60 disabled:bg-subtle'

function useFieldIds(id: string | undefined, hint: ReactNode, error: string | null | undefined) {
  const generated = useId()
  const controlId = id ?? generated
  const hintId = hint ? `${controlId}-hint` : undefined
  const errorId = error ? `${controlId}-error` : undefined
  return { controlId, hintId, errorId, describedBy: [errorId, hintId].filter(Boolean).join(' ') || undefined }
}

function FieldFrame(props: {
  chrome: FieldChrome
  controlId: string
  hintId?: string
  errorId?: string
  children: ReactNode
}) {
  const { chrome, controlId, hintId, errorId, children } = props
  return (
    <div className={cx('flex flex-col gap-1.5', chrome.containerClassName)}>
      <label htmlFor={controlId} className={cx('text-sm font-medium text-fg', chrome.hideLabel && 'sr-only')}>
        {chrome.label}
      </label>
      <div className="relative">
        {children}
        {chrome.trailing ? (
          <div className="absolute inset-y-0 right-1 flex items-center">{chrome.trailing}</div>
        ) : null}
      </div>
      {chrome.error || chrome.hint || chrome.counter ? (
        <div className="flex items-start justify-between gap-3 text-xs">
          <div className="min-w-0">
            {chrome.error ? (
              <p id={errorId} className="font-medium text-danger-ink">
                {chrome.error}
              </p>
            ) : null}
            {chrome.hint ? (
              <p id={hintId} className="text-muted">
                {chrome.hint}
              </p>
            ) : null}
          </div>
          {chrome.counter ? <div className="shrink-0 text-muted tabular-nums">{chrome.counter}</div> : null}
        </div>
      ) : null}
    </div>
  )
}

export interface InputProps extends InputHTMLAttributes<HTMLInputElement>, FieldChrome {
  ref?: Ref<HTMLInputElement>
}

export function Input({
  label,
  hideLabel,
  hint,
  error,
  counter,
  trailing,
  containerClassName,
  id,
  className,
  ...rest
}: InputProps) {
  const ids = useFieldIds(id, hint, error)
  return (
    <FieldFrame chrome={{ label, hideLabel, hint, error, counter, trailing, containerClassName }} {...ids}>
      <input
        id={ids.controlId}
        aria-invalid={error ? true : undefined}
        aria-describedby={ids.describedBy}
        className={cx(
          CONTROL,
          'h-10',
          error ? 'border-danger' : 'border-line-strong hover:border-faint',
          trailing ? 'pr-11' : null,
          className,
        )}
        {...rest}
      />
    </FieldFrame>
  )
}

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement>, Omit<FieldChrome, 'trailing'> {
  ref?: Ref<HTMLTextAreaElement>
}

export function Textarea({
  label,
  hideLabel,
  hint,
  error,
  counter,
  containerClassName,
  id,
  className,
  ...rest
}: TextareaProps) {
  const ids = useFieldIds(id, hint, error)
  return (
    <FieldFrame chrome={{ label, hideLabel, hint, error, counter, containerClassName }} {...ids}>
      <textarea
        id={ids.controlId}
        aria-invalid={error ? true : undefined}
        aria-describedby={ids.describedBy}
        className={cx(
          CONTROL,
          'block py-2.5 leading-relaxed',
          error ? 'border-danger' : 'border-line-strong hover:border-faint',
          className,
        )}
        {...rest}
      />
    </FieldFrame>
  )
}
