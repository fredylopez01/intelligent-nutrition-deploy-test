import type { InventoryMovement } from '../../types/inventoryMovement'
import { formatExpirationDate } from '../../utils/inventory'
import {
  MOVEMENT_KIND_LABELS,
  formatMovementDate,
  movementDirection,
  movementKind,
  movementPlace,
  signedQuantity,
} from '../../utils/inventoryMovements'

import './MovementsTable.css'

interface MovementsTableProps {
  movements: InventoryMovement[]
  viewedBranchId?: string
  onViewDetail: (movement: InventoryMovement) => void
}

export function MovementsTable({ movements, viewedBranchId, onViewDetail }: MovementsTableProps) {
  return (
    <table className="movements-table">
      <caption className="sr-only">
        Movimientos de inventario, del más reciente al más antiguo
      </caption>
      <thead>
        <tr>
          <th scope="col" className="movements-table__col-type">
            Movimiento
          </th>
          <th scope="col" className="movements-table__col-product">
            Producto
          </th>
          <th scope="col" className="movements-table__col-lot">
            Lote
          </th>
          <th scope="col" className="movements-table__col-quantity">
            Cantidad
          </th>
          <th scope="col" className="movements-table__col-place">
            Sede
          </th>
          <th scope="col" className="movements-table__col-user">
            Registró
          </th>
          <th scope="col" className="movements-table__col-actions">
            <span className="sr-only">Detalle</span>
          </th>
        </tr>
      </thead>
      <tbody>
        {movements.map((movement) => {
          const kind = movementKind(movement)
          const direction = movementDirection(movement, viewedBranchId)
          return (
            <tr key={movement.id}>
              <td className="movements-table__col-type">
                <span className={`movement-kind movement-kind--${direction}`}>
                  {MOVEMENT_KIND_LABELS[kind]}
                </span>
                <span className="movements-table__inline-product">{movement.product.name}</span>
                <span className="movements-table__date">
                  {formatMovementDate(movement.movementAt)}
                </span>
              </td>
              <td className="movements-table__col-product movements-table__product">
                <span className="movements-table__product-name">{movement.product.name}</span>
                <span className="movements-table__product-ref">
                  {movement.product.referenceCode}
                </span>
              </td>
              <td className="movements-table__col-lot movements-table__muted">
                {movement.expirationDate ? formatExpirationDate(movement.expirationDate) : '—'}
              </td>
              <td
                className={`movements-table__col-quantity movements-table__quantity movements-table__quantity--${direction}`}
              >
                {signedQuantity(movement, viewedBranchId)}
              </td>
              <td className="movements-table__col-place movements-table__muted">
                {movementPlace(movement)}
              </td>
              <td className="movements-table__col-user movements-table__muted">
                {movement.user.fullName}
              </td>
              <td className="movements-table__col-actions">
                <button
                  type="button"
                  className="movements-table__detail"
                  aria-label={`Ver detalle del movimiento de ${movement.product.name} del ${formatMovementDate(movement.movementAt)}`}
                  onClick={() => onViewDetail(movement)}
                >
                  Ver
                </button>
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}
