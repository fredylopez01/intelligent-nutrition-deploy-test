import { useEffect, useState } from 'react'

import { generalStockService } from '../services/generalStock.service'
import { inventoryService } from '../services/inventory.service'

import { useAuth } from './useAuth'

export interface MovementLot {
  expirationDate: string
  quantity: number
}

type LotsSource = 'branch' | 'general'

interface LotsResult {
  key: string
  status: 'success' | 'error'
  lots: MovementLot[]
}

export function useMovementLots(
  source: LotsSource,
  branchId: string | null,
  productId: string | null,
  reloadToken = 0,
) {
  const { token } = useAuth()
  const [result, setResult] = useState<LotsResult | null>(null)
  const enabled = productId !== null && (source === 'general' || branchId !== null)
  const requestKey = `${source}|${branchId ?? ''}|${productId ?? ''}|${token ?? ''}|${reloadToken}`

  useEffect(() => {
    if (!enabled || !productId) return
    let cancelled = false
    const request =
      source === 'general'
        ? generalStockService
            .getByProduct(productId, token)
            .then((detail) =>
              detail.lots.map(({ expirationDate, quantity }) => ({ expirationDate, quantity })),
            )
        : inventoryService.getProductInBranch(branchId ?? '', productId, token).then((detail) =>
            detail.lots.map(({ expirationDate, quantity }) => ({
              expirationDate: expirationDate.slice(0, 10),
              quantity,
            })),
          )
    request
      .then((lots) => {
        if (cancelled) return
        const sorted = [...lots].sort((a, b) => a.expirationDate.localeCompare(b.expirationDate))
        setResult({ key: requestKey, status: 'success', lots: sorted })
      })
      .catch(() => {
        if (!cancelled) setResult({ key: requestKey, status: 'error', lots: [] })
      })
    return () => {
      cancelled = true
    }
  }, [enabled, requestKey, source, branchId, productId, token])

  if (!enabled) return { status: 'idle' as const, lots: [] }
  const isCurrent = result?.key === requestKey
  return {
    status: isCurrent ? result.status : ('loading' as const),
    lots: isCurrent ? result.lots : [],
  }
}
