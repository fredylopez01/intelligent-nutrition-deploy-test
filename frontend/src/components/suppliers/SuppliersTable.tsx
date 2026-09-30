import type { Supplier } from '../../types/supplier'

import './SuppliersTable.css'

interface SuppliersTableProps {
  suppliers: Supplier[]
}

export function SuppliersTable({ suppliers }: SuppliersTableProps) {
  return (
    <table className="suppliers-table">
      <caption className="sr-only">Proveedores registrados en Intelligent Nutrition</caption>
      <thead>
        <tr>
          <th scope="col">Nombre / Razón social</th>
          <th scope="col">Nombre comercial</th>
          <th scope="col">Documento</th>
          <th scope="col">Teléfono</th>
          <th scope="col">Correo</th>
          <th scope="col" className="suppliers-table__col-address">
            Dirección
          </th>
          <th scope="col" className="suppliers-table__col-status">
            Estado
          </th>
        </tr>
      </thead>
      <tbody>
        {suppliers.map((supplier) => (
          <tr key={supplier.id} className="suppliers-table__row">
            <td className="suppliers-table__name">{supplier.person.businessName ?? '—'}</td>
            <td className="suppliers-table__cell-muted">{supplier.commercialName ?? '—'}</td>
            <td className="suppliers-table__cell-muted suppliers-table__document">
              {supplier.person.documentType
                ? `${supplier.person.documentType.code} ${supplier.person.documentNumber ?? ''}`
                : (supplier.person.documentNumber ?? '—')}
            </td>
            <td className="suppliers-table__cell-muted">{supplier.person.phone ?? '—'}</td>
            <td className="suppliers-table__cell-muted suppliers-table__email">
              {supplier.person.email ?? '—'}
            </td>
            <td className="suppliers-table__cell-muted suppliers-table__col-address">
              {supplier.person.address ?? '—'}
            </td>
            <td className="suppliers-table__col-status">
              <span
                className={`ui-status ui-status--${supplier.person.active ? 'activo' : 'inactivo'}`}
              >
                {supplier.person.active ? 'Activo' : 'Inactivo'}
              </span>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
