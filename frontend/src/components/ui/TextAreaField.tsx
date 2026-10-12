import type { Ref, TextareaHTMLAttributes } from 'react'

import './field.css'
import './TextAreaField.css'

interface TextAreaFieldProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  id: string
  label: string
  error?: string
  hint?: string
  length?: number
  ref?: Ref<HTMLTextAreaElement>
}

export function TextAreaField({
  id,
  label,
  error,
  hint,
  length,
  maxLength,
  ref,
  ...rest
}: TextAreaFieldProps) {
  const errorId = `${id}-error`
  const hintId = `${id}-hint`
  const counterId = `${id}-counter`
  const showCounter = length !== undefined && maxLength !== undefined
  const describedBy = [error ? errorId : null, hint ? hintId : null, showCounter ? counterId : null]
    .filter(Boolean)
    .join(' ')

  return (
    <div className="ui-field">
      <label className="ui-field__label" htmlFor={id}>
        {label}
      </label>
      <textarea
        id={id}
        ref={ref}
        maxLength={maxLength}
        className={`ui-field__control ui-field__control--textarea${error ? ' ui-field__control--invalid' : ''}`}
        aria-invalid={!!error}
        aria-describedby={describedBy || undefined}
        {...rest}
      />
      {(hint || showCounter) && (
        <div className="ui-field__meta">
          {hint && (
            <span id={hintId} className="ui-field__hint">
              {hint}
            </span>
          )}
          {showCounter && (
            <span id={counterId} className="ui-field__counter">
              {length}/{maxLength}
            </span>
          )}
        </div>
      )}
      {error && (
        <span id={errorId} role="alert" className="ui-field__error">
          {error}
        </span>
      )}
    </div>
  )
}
