import { Link } from 'react-router-dom'

import type { Supplier } from '../../types/supplier'
import {
  SUPPLIER_KIND_LABELS,
  getSupplierDocument,
  getSupplierKind,
  getSupplierName,
} from '../../utils/suppliers'
import { Avatar } from '../ui/Avatar'
import { StatusBadge } from '../users/StatusBadge'

import './SuppliersTable.css'

interface SuppliersTableProps {
  suppliers: Supplier[]
  returnTo: string
}

export function SuppliersTable({ suppliers, returnTo }: SuppliersTableProps) {
  return (
    <table className="suppliers-table">
      <caption className="sr-only">Proveedores registrados en Intelligent Nutrition</caption>
      <thead>
        <tr>
          <th scope="col">Proveedor</th>
          <th scope="col">Documento</th>
          <th scope="col">Teléfono</th>
          <th scope="col" className="suppliers-table__col-status">
            Estado
          </th>
          <th scope="col" className="suppliers-table__col-open">
            <span className="sr-only">Abrir</span>
          </th>
        </tr>
      </thead>
      <tbody>
        {suppliers.map((supplier) => {
          const href = `/proveedores/${supplier.id}`
          const name = getSupplierName(supplier)

          return (
            <tr key={supplier.id} className="suppliers-table__row">
              <td>
                <Link
                  to={href}
                  state={{ from: returnTo }}
                  className="suppliers-table__identity-link"
                  aria-label={`Ver detalle de ${name}`}
                >
                  <Avatar name={name} muted={!supplier.person.active} />
                  <span className="suppliers-table__identity">
                    <span className="suppliers-table__name">{name}</span>
                    <span className="suppliers-table__secondary">
                      {supplier.commercialName || supplier.person.email || '—'}
                    </span>
                  </span>
                </Link>
              </td>
              <td>
                <span className="suppliers-table__document">{getSupplierDocument(supplier)}</span>
                <span className="suppliers-table__kind">
                  {SUPPLIER_KIND_LABELS[getSupplierKind(supplier)]}
                </span>
              </td>
              <td className="suppliers-table__cell-muted">{supplier.person.phone ?? '—'}</td>
              <td className="suppliers-table__col-status">
                <StatusBadge status={supplier.person.active ? 'activo' : 'inactivo'} />
              </td>
              <td className="suppliers-table__col-open">
                <Link
                  to={href}
                  state={{ from: returnTo }}
                  className="suppliers-table__open"
                  tabIndex={-1}
                  aria-hidden="true"
                >
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="m9 6 6 6-6 6" />
                  </svg>
                </Link>
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}
