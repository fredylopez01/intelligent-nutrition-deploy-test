import type { User } from '../../types/user'
import { getRoleLabel } from '../../utils/format'
import { getUserStatus } from '../../utils/users'
import { Avatar } from '../ui/Avatar'

import { StatusBadge } from './StatusBadge'

import './UsersTable.css'

interface UsersTableProps {
  users: User[]
  selectedUserId: string | null
  onSelect: (user: User) => void
}

export function UsersTable({ users, selectedUserId, onSelect }: UsersTableProps) {
  return (
    <table className="users-table">
      <caption className="sr-only">Usuarios registrados en Intelligent Nutrition</caption>
      <thead>
        <tr>
          <th scope="col">Usuario</th>
          <th scope="col">Rol</th>
          <th scope="col">Sede</th>
          <th scope="col" className="users-table__col-status">
            Estado
          </th>
        </tr>
      </thead>
      <tbody>
        {users.map((user) => {
          const status = getUserStatus(user)
          const isSelected = user.id === selectedUserId

          return (
            <tr
              key={user.id}
              className={`users-table__row${isSelected ? ' users-table__row--selected' : ''}`}
            >
              <td>
                <button
                  type="button"
                  className="users-table__selector"
                  onClick={() => onSelect(user)}
                  aria-pressed={isSelected}
                  aria-label={`Ver y editar a ${user.fullName}`}
                >
                  <Avatar
                    name={user.fullName}
                    highlighted={isSelected}
                    muted={status === 'inactivo'}
                  />
                  <span className="users-table__identity">
                    <span className="users-table__name">{user.fullName}</span>
                    <span className="users-table__email">{user.email}</span>
                  </span>
                </button>
              </td>
              <td className="users-table__cell-muted">{getRoleLabel(user.role.name)}</td>
              <td className="users-table__cell-muted">Sin asignar</td>
              <td className="users-table__col-status">
                <StatusBadge status={status} />
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}
