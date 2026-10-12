import { useState } from 'react'
import type { FormEvent } from 'react'

import './SearchBar.css'

interface SearchBarProps {
  id: string
  label: string
  placeholder: string
  value: string
  onSearch: (term: string) => void
  minLength?: number
}

const iconProps = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.7,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
}

export function SearchBar({
  id,
  label,
  placeholder,
  value,
  onSearch,
  minLength = 2,
}: SearchBarProps) {
  const [draft, setDraft] = useState(value)
  const [appliedValue, setAppliedValue] = useState(value)
  const [error, setError] = useState<string | null>(null)

  if (value !== appliedValue) {
    setAppliedValue(value)
    setDraft(value)
    setError(null)
  }

  const errorId = `${id}-error`

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const term = draft.trim()
    if (term.length > 0 && term.length < minLength) {
      setError(`Escribe al menos ${minLength} caracteres para buscar.`)
      return
    }
    setError(null)
    onSearch(term)
  }

  const handleClear = () => {
    setDraft('')
    setError(null)
    if (value !== '') onSearch('')
  }

  return (
    <form className="ui-search" role="search" onSubmit={handleSubmit} noValidate>
      <label className="sr-only" htmlFor={id}>
        {label}
      </label>
      <div className={`ui-search__field${error ? ' ui-search__field--invalid' : ''}`}>
        <input
          id={id}
          type="search"
          className="ui-search__input"
          placeholder={placeholder}
          value={draft}
          autoComplete="off"
          aria-invalid={!!error}
          aria-describedby={error ? errorId : undefined}
          onChange={(event) => {
            setDraft(event.target.value)
            if (error) setError(null)
          }}
        />
        {draft !== '' && (
          <button
            type="button"
            className="ui-search__clear"
            aria-label="Limpiar búsqueda"
            onClick={handleClear}
          >
            <svg {...iconProps}>
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        )}
        <button type="submit" className="ui-search__submit" aria-label="Buscar">
          <svg {...iconProps}>
            <circle cx="11" cy="11" r="6.5" />
            <path d="m20 20-4.2-4.2" />
          </svg>
        </button>
      </div>
      {error && (
        <p id={errorId} className="ui-search__error" role="alert">
          {error}
        </p>
      )}
    </form>
  )
}
