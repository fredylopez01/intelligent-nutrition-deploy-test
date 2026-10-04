import { Link } from 'react-router-dom'

import type { User } from '../../types/user'
import { getRoleLabel } from '../../utils/format'
import {
  getUserBranchesLabel,
  getUserEmail,
  getUserFullName,
  getUserStatus,
} from '../../utils/users'
import { Avatar } from '../ui/Avatar'

import { StatusBadge } from './StatusBadge'

import './UsersTable.css'

interface UsersTableProps {
  users: User[]
  returnTo: string
}

export function UsersTable({ users, returnTo }: UsersTableProps) {
  return (
    <table className="users-table">
      <caption className="sr-only">Usuarios registrados en Intelligent Nutrition</caption>
      <thead>
        <tr>
          <th scope="col">Usuario</th>
          <th scope="col">Rol</th>
          <th scope="col">Sedes</th>
          <th scope="col" className="users-table__col-status">
            Estado
          </th>
          <th scope="col" className="users-table__col-open">
            <span className="sr-only">Abrir</span>
          </th>
        </tr>
      </thead>
      <tbody>
        {users.map((user) => {
          const status = getUserStatus(user)
          const fullName = getUserFullName(user)
          const href = `/usuarios/${user.id}`

          return (
            <tr key={user.id} className="users-table__row">
              <td>
                <Link
                  to={href}
                  state={{ from: returnTo }}
                  className="users-table__identity-link"
                  aria-label={`Ver detalle de ${fullName}`}
                >
                  <Avatar name={fullName} muted={status === 'inactivo'} />
                  <span className="users-table__identity">
                    <span className="users-table__name">{fullName}</span>
                    <span className="users-table__email">{getUserEmail(user)}</span>
                  </span>
                </Link>
              </td>
              <td className="users-table__cell-muted">{getRoleLabel(user.role.name)}</td>
              <td
                className="users-table__cell-muted"
                title={user.branches.map((branch) => branch.name).join(', ')}
              >
                {getUserBranchesLabel(user)}
              </td>
              <td className="users-table__col-status">
                <StatusBadge status={status} />
              </td>
              <td className="users-table__col-open">
                <Link
                  to={href}
                  state={{ from: returnTo }}
                  className="users-table__open"
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
