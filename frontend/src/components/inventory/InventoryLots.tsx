import { useEffect, useState } from 'react'

import { useAuth } from '../../hooks/useAuth'
import { inventoryService } from '../../services/inventory.service'
import type { BranchInventoryDetail, BranchInventoryItem } from '../../types/inventory'
import {
  expirationLabel,
  expirationState,
  formatExpirationDate,
  formatQuantity,
  resolveInventoryError,
} from '../../utils/inventory'
import { Alert } from '../ui/Alert'
import { Button } from '../ui/Button'

import { StockStatus } from './StockStatus'

import './InventoryLots.css'

interface InventoryLotsProps {
  branchId: string
  item: BranchInventoryItem
  onClose: () => void
}

interface LotsResult {
  key: string
  detail: BranchInventoryDetail | null
  error: string | null
}

export function InventoryLots({ branchId, item, onClose }: InventoryLotsProps) {
  const { token } = useAuth()
  const [result, setResult] = useState<LotsResult | null>(null)
  const [reloadToken, setReloadToken] = useState(0)
  const requestKey = `${branchId}|${item.product.id}|${reloadToken}`

  useEffect(() => {
    let cancelled = false
    inventoryService
      .getProductInBranch(branchId, item.product.id, token)
      .then((detail) => {
        if (!cancelled) setResult({ key: requestKey, detail, error: null })
      })
      .catch((error: unknown) => {
        if (cancelled) return
        setResult({
          key: requestKey,
          detail: null,
          error: resolveInventoryError(error, 'No fue posible cargar los lotes. Intenta de nuevo.'),
        })
      })
    return () => {
      cancelled = true
    }
  }, [requestKey, branchId, item.product.id, token])

  const isCurrent = result?.key === requestKey
  const detail = isCurrent ? result.detail : null
  const error = isCurrent ? result.error : null
  const abbreviation = item.product.unitOfMeasure.abbreviation

  return (
    <div className="inventory-lots">
      <dl className="inventory-lots__summary">
        <div>
          <dt>Existencias totales</dt>
          <dd>{formatQuantity(detail?.totalQuantity ?? item.totalQuantity, abbreviation)}</dd>
        </div>
        {(detail?.minimumStock ?? item.minimumStock) !== undefined && (
          <div>
            <dt>Stock mínimo</dt>
            <dd>{formatQuantity(detail?.minimumStock ?? item.minimumStock ?? 0, abbreviation)}</dd>
          </div>
        )}
        <div>
          <dt>Estado</dt>
          <dd>
            <StockStatus
              totalQuantity={detail?.totalQuantity ?? item.totalQuantity}
              lowStock={detail?.lowStock ?? item.lowStock}
            />
          </dd>
        </div>
      </dl>

      {!isCurrent && (
        <p className="inventory-lots__loading" role="status">
          Cargando lotes...
        </p>
      )}

      {error && (
        <div className="inventory-lots__error">
          <Alert tone="error">{error}</Alert>
          <Button variant="outline" onClick={() => setReloadToken((value) => value + 1)}>
            Reintentar
          </Button>
        </div>
      )}

      {detail && (
        <table className="inventory-lots__table">
          <caption className="sr-only">
            Lotes de {item.product.name} ordenados por fecha de vencimiento
          </caption>
          <thead>
            <tr>
              <th scope="col">Vencimiento</th>
              <th scope="col" className="inventory-lots__number">
                Cantidad
              </th>
              <th scope="col" className="inventory-lots__state">
                <span className="sr-only">Estado del lote</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {detail.lots.map((lot) => {
              const { state } = expirationState(lot.expirationDate)
              return (
                <tr key={lot.id}>
                  <td className="inventory-lots__date">
                    {formatExpirationDate(lot.expirationDate)}
                  </td>
                  <td className="inventory-lots__number">
                    {formatQuantity(lot.quantity, abbreviation)}
                  </td>
                  <td className="inventory-lots__state">
                    <span className={`inventory-lots__badge inventory-lots__badge--${state}`}>
                      {expirationLabel(lot.expirationDate)}
                    </span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}

      <p className="inventory-lots__note">
        Los lotes se diferencian por su fecha de vencimiento. Para aumentar o reducir cantidades se
        usan los movimientos de inventario.
      </p>

      <div className="inventory-lots__actions">
        <Button variant="outline" onClick={onClose}>
          Cerrar
        </Button>
      </div>
    </div>
  )
}
