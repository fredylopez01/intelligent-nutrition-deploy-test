import type { UnitOfMeasure } from '../../types/unit'

import '../users/StatusBadge.css'
import '../categories/CategoriesTable.css'

interface UnitsTableProps {
  units: UnitOfMeasure[]
}

export function UnitsTable({ units }: UnitsTableProps) {
  return (
    <table className="categories-table units-table">
      <caption className="sr-only">Unidades de medida del catálogo de productos</caption>
      <thead>
        <tr>
          <th scope="col">Nombre</th>
          <th scope="col">Abreviatura</th>
          <th scope="col" className="categories-table__col-status">
            Estado
          </th>
        </tr>
      </thead>
      <tbody>
        {units.map((unit) => (
          <tr key={unit.id}>
            <td className="categories-table__name">{unit.name}</td>
            <td className="categories-table__description">
              <span className="units-table__abbreviation">{unit.abbreviation}</span>
            </td>
            <td className="categories-table__col-status">
              <span className={`ui-status ui-status--${unit.active ? 'activo' : 'inactivo'}`}>
                {unit.active ? 'Activa' : 'Inactiva'}
              </span>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
