import { useDocumentTypes } from '../../hooks/useDocumentTypes'
import type { PersonSearchResult } from '../../types/person'
import { getPersonName } from '../../utils/persons'
import { Button } from '../ui/Button'

import { PersonTags } from './PersonTags'

import './PersonLookup.css'

interface PersonSummaryProps {
  person: PersonSearchResult
  onChange: () => void
  disabled?: boolean
}

export function PersonSummary({ person, onChange, disabled = false }: PersonSummaryProps) {
  const { documentTypes } = useDocumentTypes()
  const documentType = documentTypes.find((type) => type.id === person.documentTypeId)

  return (
    <section className="person-summary" aria-label="Persona seleccionada">
      <div className="person-summary__head">
        <div>
          <p className="person-summary__name">{getPersonName(person)}</p>
          <PersonTags relationships={person.relationships} />
        </div>
        <Button variant="ghost" onClick={onChange} disabled={disabled}>
          Cambiar persona
        </Button>
      </div>
      <dl className="person-summary__facts">
        <div>
          <dt>Documento</dt>
          <dd>
            {documentType ? `${documentType.code} ` : ''}
            {person.documentNumber}
          </dd>
        </div>
        <div>
          <dt>Correo</dt>
          <dd>{person.email}</dd>
        </div>
        <div>
          <dt>Teléfono</dt>
          <dd>{person.phone}</dd>
        </div>
        <div>
          <dt>Dirección</dt>
          <dd>{person.address}</dd>
        </div>
      </dl>
    </section>
  )
}
