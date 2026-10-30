import { useEffect, useState } from 'react'

import { useAuth } from '../../hooks/useAuth'
import { inventoryService } from '../../services/inventory.service'
import type {
  AvailabilityBranch,
  InventoryProduct,
  ProductAvailability as Availability,
} from '../../types/inventory'
import { formatQuantity, resolveInventoryError } from '../../utils/inventory'
import { Alert } from '../ui/Alert'
import { Button } from '../ui/Button'

import './ProductAvailability.css'

interface ProductAvailabilityProps {
  branchId: string
  product: InventoryProduct
  transferOriginIds?: string[]
  onRequestTransfer?: (origin: AvailabilityBranch) => void
  onClose: () => void
}

interface AvailabilityResult {
  key: string
  availability: Availability | null
  error: string | null
}

export function ProductAvailability({
  branchId,
  product,
  transferOriginIds = [],
  onRequestTransfer,
  onClose,
}: ProductAvailabilityProps) {
  const { token } = useAuth()
  const [result, setResult] = useState<AvailabilityResult | null>(null)
  const [reloadToken, setReloadToken] = useState(0)
  const requestKey = `${product.id}|${reloadToken}`
  const abbreviation = product.unitOfMeasure.abbreviation

  useEffect(() => {
    let cancelled = false
    inventoryService
      .availability(product.id, token)
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
  }, [requestKey, product.id, token])

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
  const others = branches.filter((branch) => branch.branchId !== branchId && branch.quantity > 0)
  const canTransferFrom = (branch: AvailabilityBranch) =>
    onRequestTransfer !== undefined &&
    branch.branchId !== branchId &&
    branch.quantity > 0 &&
    transferOriginIds.includes(branch.branchId)
  const showActions = branches.some(canTransferFrom)
  const needsRequest =
    onRequestTransfer !== undefined && others.some((branch) => !canTransferFrom(branch))

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
            {others.length === 0
              ? 'Ninguna otra sede activa tiene existencias de este producto.'
              : others.length === 1
                ? '1 sede más tiene existencias de este producto.'
                : `${others.length} sedes más tienen existencias de este producto.`}
          </p>
          {branches.length === 0 ? (
            <p className="availability__empty-state">
              No hay sedes activas para consultar. Cuando se active una sede, aquí verás sus
              existencias.
            </p>
          ) : (
            <table className="availability__table">
              <caption className="sr-only">Existencias por sede</caption>
              <thead>
                <tr>
                  <th scope="col">Sede</th>
                  <th scope="col" className="availability__numeric">
                    Existencias vigentes
                  </th>
                  {showActions && (
                    <th scope="col">
                      <span className="sr-only">Acciones</span>
                    </th>
                  )}
                </tr>
              </thead>
              <tbody>
                {branches.map((branch) => {
                  const isCurrentBranch = branch.branchId === branchId
                  return (
                    <tr
                      key={branch.branchId}
                      className={isCurrentBranch ? 'availability__row--current' : undefined}
                    >
                      <th scope="row" className="availability__branch">
                        {branch.branchName}
                        {isCurrentBranch && <span className="availability__tag">Esta sede</span>}
                      </th>
                      <td className="availability__numeric">
                        {branch.quantity === 0 ? (
                          <span className="availability__out">Sin existencias</span>
                        ) : (
                          <span className="availability__quantity">
                            {formatQuantity(branch.quantity, abbreviation)}
                          </span>
                        )}
                      </td>
                      {showActions && (
                        <td className="availability__action">
                          {canTransferFrom(branch) && (
                            <button
                              type="button"
                              className="availability__transfer"
                              aria-label={`Solicitar traslado desde ${branch.branchName}`}
                              onClick={() => onRequestTransfer?.(branch)}
                            >
                              Solicitar traslado
                            </button>
                          )}
                        </td>
                      )}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </>
      )}

      {needsRequest && (
        <Alert tone="info">
          Los traslados los registra el superadmin o el líder de la sede de origen. Pídeles las
          unidades que necesitas.
        </Alert>
      )}

      <p className="availability__note">
        Solo se cuentan sedes activas y lotes vigentes; no incluye stock mínimo ni precios.
      </p>

      <div className="availability__actions">
        <Button variant="outline" onClick={onClose}>
          Cerrar
        </Button>
      </div>
    </div>
  )
}
