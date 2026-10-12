import type { Category } from '../../types/category'
import { RowActions, type RowAction } from '../ui/RowActions'

import '../users/StatusBadge.css'
import './CategoriesTable.css'

interface CategoriesTableProps {
  categories: Category[]
  canEdit: boolean
  canChangeStatus: boolean
  onEdit: (category: Category) => void
  onToggleStatus: (category: Category) => void
}

export function CategoriesTable({
  categories,
  canEdit,
  canChangeStatus,
  onEdit,
  onToggleStatus,
}: CategoriesTableProps) {
  const hasActions = canEdit || canChangeStatus

  const buildActions = (category: Category): RowAction[] => {
    const actions: RowAction[] = []
    if (canEdit) actions.push({ label: 'Editar', onSelect: () => onEdit(category) })
    if (canChangeStatus) {
      actions.push({
        label: category.active ? 'Desactivar' : 'Activar',
        tone: category.active ? 'danger' : undefined,
        onSelect: () => onToggleStatus(category),
      })
    }
    return actions
  }

  return (
    <table className="categories-table">
      <caption className="sr-only">Categorías del catálogo de productos</caption>
      <thead>
        <tr>
          <th scope="col">Nombre</th>
          <th scope="col">Descripción</th>
          <th scope="col" className="categories-table__col-status">
            Estado
          </th>
          {hasActions && (
            <th scope="col" className="categories-table__col-actions">
              <span className="sr-only">Acciones</span>
            </th>
          )}
        </tr>
      </thead>
      <tbody>
        {categories.map((category) => (
          <tr key={category.id}>
            <td className="categories-table__name">{category.name}</td>
            <td className="categories-table__description">{category.description || '—'}</td>
            <td className="categories-table__col-status">
              <span className={`ui-status ui-status--${category.active ? 'activo' : 'inactivo'}`}>
                {category.active ? 'Activa' : 'Inactiva'}
              </span>
            </td>
            {hasActions && (
              <td className="categories-table__col-actions">
                <RowActions
                  label={`Acciones para ${category.name}`}
                  actions={buildActions(category)}
                />
              </td>
            )}
          </tr>
        ))}
      </tbody>
    </table>
  )
}
