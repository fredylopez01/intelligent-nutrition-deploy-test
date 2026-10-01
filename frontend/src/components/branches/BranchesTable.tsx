import type { Branch } from '../../types/branch'
import { StatusBadge } from '../users/StatusBadge'

import { BranchRowActions } from './BranchRowActions'

import './BranchesTable.css'

interface BranchesTableProps {
  branches: Branch[]
  onEdit: (branch: Branch) => void
}

export function BranchesTable({ branches, onEdit }: BranchesTableProps) {
  return (
    <table className="branches-table">
      <caption className="sr-only">Sedes registradas en Intelligent Nutrition</caption>
      <thead>
        <tr>
          <th scope="col">Nombre</th>
          <th scope="col">Dirección</th>
          <th scope="col">Teléfono</th>
          <th scope="col" className="branches-table__col-status">
            Estado
          </th>
          <th scope="col" className="branches-table__col-actions">
            <span className="sr-only">Acciones</span>
          </th>
        </tr>
      </thead>
      <tbody>
        {branches.map((branch) => (
          <tr key={branch.id} className="branches-table__row">
            <td className="branches-table__name">{branch.name}</td>
            <td className="branches-table__cell-muted">{branch.address}</td>
            <td className="branches-table__cell-muted">{branch.phone}</td>
            <td className="branches-table__col-status">
              <StatusBadge status={branch.active ? 'activo' : 'inactivo'} />
            </td>
            <td className="branches-table__col-actions">
              <BranchRowActions branchName={branch.name} onEdit={() => onEdit(branch)} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
