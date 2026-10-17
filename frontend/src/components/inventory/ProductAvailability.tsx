import { useEffect, useState } from 'react'

import { useAuth } from '../../hooks/useAuth'
import { inventoryService } from '../../services/inventory.service'
import type {
  BranchInventoryItem,
  ProductAvailability as Availability,
} from '../../types/inventory'
import { formatQuantity, resolveInventoryError } from '../../utils/inventory'
import { Alert } from '../ui/Alert'
import { Button } from '../ui/Button'

import './ProductAvailability.css'

interface ProductAvailabilityProps {
  branchId: string
  item: BranchInventoryItem
  onClose: () => void
}

interface AvailabilityResult {
  key: string
  availability: Availability | null
  error: string | null
}

export function ProductAvailability({ branchId, item, onClose }: ProductAvailabilityProps) {
  const { token } = useAuth()
  const [result, setResult] = useState<AvailabilityResult | null>(null)
  const [reloadToken, setReloadToken] = useState(0)
  const requestKey = `${item.product.id}|${reloadToken}`
  const abbreviation = item.product.unitOfMeasure.abbreviation

  useEffect(() => {
    let cancelled = false
    inventoryService
      .availability(item.product.id, token)
      .then((availability) => {
        if (!cancelled) setResult({ key: requestKey, availability, error: null })
      })
      .catch((error: unknown) => {
        if (cancelled) return
        setResult({
          key: requestKey,
          availability: null,
          error: resolveInventoryError(
            error,
            'No fue posible consultar la disponibilidad. Intenta de nuevo.',
          ),
        })
      })
    return () => {
      cancelled = true
    }
  }, [requestKey, item.product.id, token])

  const isCurrent = result?.key === requestKey
  const availability = isCurrent ? result.availability : null
  const error = isCurrent ? result.error : null
  const branches = availability
    ? [...availability.branches].sort(
        (a, b) =>
          Number(b.branchId === branchId) - Number(a.branchId === branchId) ||
          b.quantity - a.quantity ||
          a.branchName.localeCompare(b.branchName),
      )
    : []
  const withStock = branches.filter(
    (branch) => branch.branchId !== branchId && branch.quantity > 0,
  ).length

  return (
    <div className="availability">
      {!isCurrent && (
        <p className="availability__status" role="status">
          Consultando las sedes...
        </p>
      )}

      {error && (
        <div className="availability__error">
          <Alert tone="error">{error}</Alert>
          <Button variant="outline" onClick={() => setReloadToken((value) => value + 1)}>
            Reintentar
          </Button>
        </div>
      )}

      {availability && (
        <>
          <p className="availability__summary" role="status">
            {withStock === 0
              ? 'Ninguna otra sede activa tiene existencias de este producto.'
              : withStock === 1
                ? '1 sede más tiene existencias de este producto.'
                : `${withStock} sedes más tienen existencias de este producto.`}
          </p>
          <ul className="availability__list" aria-label="Existencias por sede">
            {branches.map((branch) => {
              const isCurrentBranch = branch.branchId === branchId
              return (
                <li
                  key={branch.branchId}
                  className={`availability__item${isCurrentBranch ? ' availability__item--current' : ''}${branch.quantity === 0 ? ' availability__item--empty' : ''}`}
                >
                  <span className="availability__branch">
                    {branch.branchName}
                    {isCurrentBranch && <span className="availability__tag">Esta sede</span>}
                  </span>
                  <span className="availability__quantity">
                    {branch.quantity === 0
                      ? 'Sin existencias'
                      : formatQuantity(branch.quantity, abbreviation)}
                  </span>
                </li>
              )
            })}
          </ul>
        </>
      )}

      <p className="availability__note">
        Solo se muestran sedes activas y la cantidad total de sus lotes; no incluye stock mínimo ni
        precios.
      </p>

      <div className="availability__actions">
        <Button variant="outline" onClick={onClose}>
          Cerrar
        </Button>
      </div>
    </div>
  )
}
