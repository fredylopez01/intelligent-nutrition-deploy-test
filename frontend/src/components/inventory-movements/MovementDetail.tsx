import type { InventoryMovement } from '../../types/inventoryMovement'
import { expirationLabel, formatExpirationDate } from '../../utils/inventory'
import {
  MOVEMENT_KIND_LABELS,
  formatMovementDate,
  movementKind,
  movementPlace,
  signedQuantity,
} from '../../utils/inventoryMovements'
import { Button } from '../ui/Button'

import './MovementDetail.css'

interface MovementDetailProps {
  movement: InventoryMovement
  viewedBranchId?: string
  onClose: () => void
}

export function MovementDetail({ movement, viewedBranchId, onClose }: MovementDetailProps) {
  const kind = movementKind(movement)
  const rows: { label: string; value: string }[] = [
    { label: 'Tipo', value: MOVEMENT_KIND_LABELS[kind] },
    { label: 'Fecha y hora', value: formatMovementDate(movement.movementAt) },
    { label: 'Producto', value: `${movement.product.name} · ${movement.product.referenceCode}` },
    { label: 'Cantidad', value: signedQuantity(movement, viewedBranchId) },
    {
      label: 'Lote',
      value: movement.expirationDate
        ? `Vence ${formatExpirationDate(movement.expirationDate)} (${expirationLabel(movement.expirationDate).toLocaleLowerCase('es')})`
        : 'Sin lote registrado',
    },
    {
      label: movement.movementType === 'TRANSFER' ? 'Origen → destino' : 'Sede',
      value: movementPlace(movement),
    },
    { label: 'Registró', value: movement.user.fullName || 'Usuario sin nombre' },
  ]

  return (
    <div className="movement-detail">
      <dl className="movement-detail__list">
        {rows.map((row) => (
          <div key={row.label} className="movement-detail__row">
            <dt>{row.label}</dt>
            <dd>{row.value}</dd>
          </div>
        ))}
      </dl>
      <div className="movement-detail__note">
        <span className="movement-detail__note-label">
          {kind.startsWith('adjustment') ? 'Razón del ajuste' : 'Observación'}
        </span>
        <p>{movement.observation || 'Sin observación.'}</p>
      </div>
      {(movement.saleId || movement.purchaseId) && (
        <p className="movement-detail__origin">
          {movement.saleId
            ? 'Movimiento generado automáticamente por una venta del punto de venta.'
            : 'Movimiento generado automáticamente por la recepción de una compra.'}
        </p>
      )}
      <div className="movement-detail__actions">
        <Button variant="outline" onClick={onClose}>
          Cerrar
        </Button>
      </div>
    </div>
  )
}
