import type { ClosureSummary } from '../../types/inventoryClosure'
import { formatExpirationDate } from '../../utils/inventory'
import { CLOSURE_STATUS_LABELS, CLOSURE_STATUS_TONES } from '../../utils/inventoryClosures'

import '../users/StatusBadge.css'
import './InventoryClosures.css'

interface ClosuresTableProps {
  closures: ClosureSummary[]
  showBranch: boolean
  showDifferences: boolean
  onView: (closure: ClosureSummary) => void
}

export function ClosuresTable({
  closures,
  showBranch,
  showDifferences,
  onView,
}: ClosuresTableProps) {
  return (
    <table className="closures-table">
      <caption className="sr-only">Historial de cierres de inventario</caption>
      <thead>
        <tr>
          <th scope="col">Fecha</th>
          {showBranch && <th scope="col">Sede</th>}
          <th scope="col">Estado</th>
          <th scope="col" className="closures-table__col-progress">
            Conteo
          </th>
          {showDifferences && (
            <th scope="col" className="closures-table__col-number">
              Diferencias
            </th>
          )}
          <th scope="col" className="closures-table__col-user">
            Inició
          </th>
          <th scope="col" className="closures-table__col-actions">
            <span className="sr-only">Detalle</span>
          </th>
        </tr>
      </thead>
      <tbody>
        {closures.map((closure) => (
          <tr key={closure.id}>
            <td className="closures-table__date">{formatExpirationDate(closure.closureDate)}</td>
            {showBranch && <td className="closures-table__muted">{closure.branchName}</td>}
            <td>
              <span className={`ui-status ui-status--${CLOSURE_STATUS_TONES[closure.status]}`}>
                {CLOSURE_STATUS_LABELS[closure.status]}
              </span>
            </td>
            <td className="closures-table__col-progress closures-table__muted">
              {closure.countedItems} de {closure.totalItems} lotes
            </td>
            {showDifferences && (
              <td className="closures-table__col-number">
                {closure.totalDifferences === null || closure.totalDifferences === undefined
                  ? '—'
                  : closure.totalDifferences}
              </td>
            )}
            <td className="closures-table__col-user closures-table__muted">
              {closure.userName ?? '—'}
            </td>
            <td className="closures-table__col-actions">
              <button
                type="button"
                className="closures-table__detail"
                aria-label={`Ver el cierre del ${formatExpirationDate(closure.closureDate)} de ${closure.branchName}`}
                onClick={() => onView(closure)}
              >
                Ver
              </button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
