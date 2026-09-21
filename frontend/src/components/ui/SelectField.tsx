import type { Ref, SelectHTMLAttributes } from 'react'

import './field.css'

interface SelectOption {
  value: string
  label: string
}

interface SelectFieldProps extends SelectHTMLAttributes<HTMLSelectElement> {
  id: string
  label: string
  options: SelectOption[]
  placeholder?: string
  error?: string
  hint?: string
  ref?: Ref<HTMLSelectElement>
}

export function SelectField({
  id,
  label,
  options,
  placeholder,
  error,
  hint,
  ref,
  ...rest
}: SelectFieldProps) {
  const errorId = `${id}-error`
  const hintId = `${id}-hint`
  const describedBy = [error ? errorId : null, hint ? hintId : null].filter(Boolean).join(' ')
  return (
    <div className="ui-field">
      <label className="ui-field__label" htmlFor={id}>
        {label}
      </label>
      <select
        id={id}
        ref={ref}
        className={`ui-field__control ui-field__control--select${
          error ? ' ui-field__control--invalid' : ''
        }`}
        aria-invalid={!!error}
        aria-describedby={describedBy || undefined}
        defaultValue=""
        {...rest}
      >
        {placeholder && (
          <option value="" disabled>
            {placeholder}
          </option>
        )}
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
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
