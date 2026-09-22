import type { InputHTMLAttributes, Ref } from 'react'

import './field.css'

interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  id: string
  label: string
  error?: string
  hint?: string
  ref?: Ref<HTMLInputElement>
}

export function TextField({ id, label, error, hint, ref, ...rest }: TextFieldProps) {
  const errorId = `${id}-error`
  const hintId = `${id}-hint`
  const describedBy = [error ? errorId : null, hint ? hintId : null].filter(Boolean).join(' ')
  return (
    <div className="ui-field">
      <label className="ui-field__label" htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        ref={ref}
        className={`ui-field__control${error ? ' ui-field__control--invalid' : ''}`}
        aria-invalid={!!error}
        aria-describedby={describedBy || undefined}
        {...rest}
      />
      {hint && (
        <span id={hintId} className="ui-field__hint">
          {hint}
        </span>
      )}
      {error && (
        <span id={errorId} role="alert" className="ui-field__error">
          {error}
        </span>
      )}
    </div>
  )
}
