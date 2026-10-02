import type { Supplier } from '../../types/supplier'

import './SuppliersTable.css'

interface SuppliersTableProps {
  suppliers: Supplier[]
  onEdit: (supplier: Supplier) => void
}

export function SuppliersTable({ suppliers, onEdit }: SuppliersTableProps) {
  return (
    <table className="suppliers-table">
      <caption className="sr-only">Proveedores registrados en Intelligent Nutrition</caption>
      <thead>
        <tr>
          <th scope="col">Proveedor</th>
          <th scope="col">Nombre comercial</th>
          <th scope="col" className="suppliers-table__col-document">
            Documento
          </th>
          <th scope="col" className="suppliers-table__col-phone">
            Teléfono
          </th>
          <th scope="col">Correo</th>
          <th scope="col" className="suppliers-table__col-address">
            Dirección
          </th>
          <th scope="col" className="suppliers-table__col-status">
            Estado
          </th>
          <th scope="col" className="suppliers-table__col-actions">
            <span className="sr-only">Acciones</span>
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
            <td className="suppliers-table__col-actions">
              <button
                type="button"
                className="suppliers-table__edit"
                aria-label={`Editar ${supplier.person.businessName ?? 'proveedor'}`}
                title="Editar"
                onClick={() => onEdit(supplier)}
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
                </svg>
              </button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
