import { Link } from 'react-router-dom'

import type { Customer } from '../../types/customer'
import { CUSTOMER_KIND_LABELS, getCustomerDocument, getCustomerKind } from '../../utils/customers'
import { Avatar } from '../ui/Avatar'
import { StatusBadge } from '../users/StatusBadge'

import './CustomersTable.css'

interface CustomersTableProps {
  customers: Customer[]
  returnTo: string
}

export function CustomersTable({ customers, returnTo }: CustomersTableProps) {
  return (
    <table className="customers-table">
      <caption className="sr-only">Clientes registrados en Intelligent Nutrition</caption>
      <thead>
        <tr>
          <th scope="col">Cliente</th>
          <th scope="col">Documento</th>
          <th scope="col">Teléfono</th>
          <th scope="col" className="customers-table__col-status">
            Estado
          </th>
          <th scope="col" className="customers-table__col-open">
            <span className="sr-only">Abrir</span>
          </th>
        </tr>
      </thead>
      <tbody>
        {customers.map((customer) => {
          const href = `/clientes/${customer.id}`
          const kind = getCustomerKind(customer)

          return (
            <tr key={customer.id} className="customers-table__row">
              <td>
                <Link
                  to={href}
                  state={{ from: returnTo }}
                  className="customers-table__identity-link"
                  aria-label={`Ver detalle de ${customer.fullName}`}
                >
                  <Avatar name={customer.fullName} muted={!customer.active} />
                  <span className="customers-table__identity">
                    <span className="customers-table__name">{customer.fullName}</span>
                    <span className="customers-table__email">{customer.person.email}</span>
                  </span>
                </Link>
              </td>
              <td>
                <span className="customers-table__document">{getCustomerDocument(customer)}</span>
                <span className="customers-table__kind">{CUSTOMER_KIND_LABELS[kind]}</span>
              </td>
              <td className="customers-table__cell-muted">{customer.person.phone}</td>
              <td className="customers-table__col-status">
                <StatusBadge status={customer.active ? 'activo' : 'inactivo'} />
              </td>
              <td className="customers-table__col-open">
                <Link
                  to={href}
                  state={{ from: returnTo }}
                  className="customers-table__open"
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
