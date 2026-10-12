import type { Category } from '../../types/category'

import '../users/StatusBadge.css'
import './CategoriesTable.css'

interface CategoriesTableProps {
  categories: Category[]
}

export function CategoriesTable({ categories }: CategoriesTableProps) {
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
          </tr>
        ))}
      </tbody>
    </table>
  )
}
