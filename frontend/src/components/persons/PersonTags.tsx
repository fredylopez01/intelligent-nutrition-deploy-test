import type { PersonRelationships } from '../../types/person'
import { RELATIONSHIP_TAGS } from '../../utils/persons'

interface PersonTagsProps {
  relationships: PersonRelationships
}

export function PersonTags({ relationships }: PersonTagsProps) {
  const tags = RELATIONSHIP_TAGS.filter((tag) => relationships[tag.key])
  if (tags.length === 0) {
    return <span className="person-tags person-tags--none">Sin rol en el sistema</span>
  }
  return (
    <ul className="person-tags" aria-label="Roles de la persona">
      {tags.map((tag) => (
        <li key={tag.key} className="person-tags__tag">
          {tag.label}
        </li>
      ))}
    </ul>
  )
}
