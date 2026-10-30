import { useCallback, useEffect, useState } from 'react'

import { inventoryMovementsService } from '../services/inventoryMovements.service'
import type { InventoryMovement, MovementsListParams } from '../types/inventoryMovement'
import type { PaginationMeta } from '../types/user'
import { resolveMovementError } from '../utils/inventoryMovements'

import { useAuth } from './useAuth'

type RequestStatus = 'idle' | 'loading' | 'success' | 'error'

interface MovementsResult {
  key: string
  status: 'success' | 'error'
  movements: InventoryMovement[]
  meta: PaginationMeta | null
  error: string | null
}

export function useInventoryMovements(params: MovementsListParams, enabled = true) {
  const { token } = useAuth()
  const [result, setResult] = useState<MovementsResult | null>(null)
  const [reloadToken, setReloadToken] = useState(0)
  const { page, limit, branchId, productId, movementType, from, to, userId } = params
  const requestKey = [
    page ?? 1,
    limit ?? 20,
    branchId ?? '',
    productId ?? '',
    movementType ?? '',
    from ?? '',
    to ?? '',
    userId ?? '',
    token ?? '',
    reloadToken,
  ].join('|')

  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    inventoryMovementsService
      .list({ page, limit, branchId, productId, movementType, from, to, userId }, token)
      .then((response) => {
        if (cancelled) return
        setResult({
          key: requestKey,
          status: 'success',
          movements: response.data,
          meta: response.meta,
          error: null,
        })
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setResult({
          key: requestKey,
          status: 'error',
          movements: [],
          meta: null,
          error: resolveMovementError(
            err,
            'No fue posible cargar los movimientos. Intenta de nuevo.',
          ),
        })
      })
    return () => {
      cancelled = true
    }
  }, [enabled, requestKey, page, limit, branchId, productId, movementType, from, to, userId, token])

  const refetch = useCallback(() => {
    setReloadToken((value) => value + 1)
  }, [])

  const isCurrent = result?.key === requestKey
  const status: RequestStatus = !enabled ? 'idle' : isCurrent ? result.status : 'loading'

  return {
    status,
    movements: isCurrent ? result.movements : [],
    meta: isCurrent ? result.meta : null,
    error: isCurrent ? result.error : null,
    refetch,
  }
}
