import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link } from 'react-router-dom'

import { useAuth } from '../../hooks/useAuth'
import { useDocumentTypes } from '../../hooks/useDocumentTypes'
import { ApiError } from '../../services/http'
import { personsService } from '../../services/persons.service'
import type { PersonRole, PersonSearchResult } from '../../types/person'
import { getPersonName, getRoleBlock } from '../../utils/persons'
import { Alert } from '../ui/Alert'
import { Button } from '../ui/Button'

import { PersonTags } from './PersonTags'

import './PersonLookup.css'

const MIN_SEARCH_LENGTH = 2
const RESULT_LIMIT = 5

const ROLE_NOUNS: Record<PersonRole, string> = {
  customer: 'cliente',
  user: 'usuario',
  supplier: 'proveedor',
}

type LookupState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'success'; term: string; people: PersonSearchResult[]; total: number }

interface PersonLookupProps {
  target: PersonRole
  onSelect: (person: PersonSearchResult) => void
  onCreateNew: (term: string) => void
  onCancel: () => void
}

export function PersonLookup({ target, onSelect, onCreateNew, onCancel }: PersonLookupProps) {
  const { token } = useAuth()
  const { documentTypes } = useDocumentTypes()
  const [term, setTerm] = useState('')
  const [termError, setTermError] = useState<string | null>(null)
  const [state, setState] = useState<LookupState>({ status: 'idle' })

  const codeById = new Map(
    documentTypes.map((documentType) => [documentType.id, documentType.code]),
  )

  const handleSearch = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const value = term.trim()
    if (value.length < MIN_SEARCH_LENGTH) {
      setTermError(`Escribe al menos ${MIN_SEARCH_LENGTH} caracteres para buscar.`)
      return
    }
    setTermError(null)
    setState({ status: 'loading' })
    try {
      const response = await personsService.search(value, RESULT_LIMIT, token)
      setState({
        status: 'success',
        term: value,
        people: response.data,
        total: response.meta.total,
      })
    } catch (error) {
      setState({
        status: 'error',
        message:
          error instanceof ApiError && error.status === 403
            ? 'No tienes permiso para buscar personas.'
            : 'No fue posible buscar. Intenta de nuevo.',
      })
    }
  }

  const noun = ROLE_NOUNS[target]
  const exactDocumentMatch =
    state.status === 'success' &&
    state.people.some((person) => person.documentNumber.toLowerCase() === state.term.toLowerCase())

  return (
    <div className="person-lookup">
      <form className="person-lookup__search" role="search" onSubmit={handleSearch} noValidate>
        <label className="person-lookup__label" htmlFor={`person-lookup-${target}`}>
          Buscar persona
        </label>
        <p className="person-lookup__hint" id={`person-lookup-${target}-hint`}>
          Antes de registrar, revisa si la persona ya existe. Busca por documento, nombre o correo.
        </p>
        <div className="person-lookup__controls">
          <input
            id={`person-lookup-${target}`}
            type="search"
            className={`person-lookup__input${termError ? ' person-lookup__input--invalid' : ''}`}
            placeholder="Ej. 1049123456, Laura Pérez o laura@correo.com"
            value={term}
            autoComplete="off"
            aria-invalid={!!termError}
            aria-describedby={`person-lookup-${target}-hint${termError ? ` person-lookup-${target}-error` : ''}`}
            onChange={(event) => {
              setTerm(event.target.value)
              if (termError) setTermError(null)
            }}
          />
          <Button type="submit" variant="outline" disabled={state.status === 'loading'}>
            {state.status === 'loading' ? 'Buscando...' : 'Buscar'}
          </Button>
        </div>
        {termError && (
          <span id={`person-lookup-${target}-error`} className="person-lookup__error" role="alert">
            {termError}
          </span>
        )}
      </form>

      {state.status === 'error' && <Alert tone="error">{state.message}</Alert>}

      {state.status === 'success' && (
        <div className="person-lookup__results">
          {state.people.length === 0 ? (
            <p className="person-lookup__empty">
              No encontramos a nadie con «{state.term}». Puedes registrar a la persona desde cero.
            </p>
          ) : (
            <>
              <ul className="person-lookup__list" aria-label="Personas encontradas">
                {state.people.map((person) => {
                  const name = getPersonName(person)
                  const block = getRoleBlock(person, target)
                  const code = codeById.get(person.documentTypeId)
                  return (
                    <li key={person.id} className="person-lookup__item">
                      <div className="person-lookup__person">
                        <span className="person-lookup__name">{name}</span>
                        <span className="person-lookup__meta">
                          {code ? `${code} ` : ''}
                          {person.documentNumber} · {person.email}
                        </span>
                        <PersonTags relationships={person.relationships} />
                      </div>
                      {block ? (
                        <span className="person-lookup__blocked">
                          {block.message}
                          {block.href && (
                            <Link className="person-lookup__link" to={block.href}>
                              Ver detalle
                            </Link>
                          )}
                        </span>
                      ) : (
                        <Button
                          variant="outline"
                          onClick={() => onSelect(person)}
                          aria-label={`Registrar a ${name} como ${noun}`}
                        >
                          Seleccionar
                        </Button>
                      )}
                    </li>
                  )
                })}
              </ul>
              {state.total > state.people.length && (
                <p className="person-lookup__more">
                  Hay {state.total} coincidencias. Escribe el documento completo para encontrarla
                  más rápido.
                </p>
              )}
            </>
          )}
        </div>
      )}

      <div className="person-lookup__actions">
        <Button variant="outline" onClick={onCancel}>
          Cancelar
        </Button>
        {state.status === 'success' && !exactDocumentMatch && (
          <Button onClick={() => onCreateNew(state.term)}>Crear desde cero</Button>
        )}
      </div>
    </div>
  )
}
