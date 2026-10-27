import { useCallback, useEffect, useState } from 'react'

import { inventoryClosuresService } from '../services/inventoryClosures.service'
import type { InventoryClosure } from '../types/inventoryClosure'
import { businessToday, resolveClosureError } from '../utils/inventoryClosures'

import { useAuth } from './useAuth'

interface TodayResult {
  key: string
  status: 'success' | 'error'
  closure: InventoryClosure | null
  error: string | null
}

export function useTodayClosure(branchId: string | null) {
  const { token } = useAuth()
  const [result, setResult] = useState<TodayResult | null>(null)
  const [reloadToken, setReloadToken] = useState(0)
  const today = businessToday()
  const requestKey = `${branchId ?? ''}|${today}|${token ?? ''}|${reloadToken}`

  useEffect(() => {
    if (!branchId) return
    let cancelled = false
    inventoryClosuresService
      .list({ branchId, from: today, to: today, page: 1, limit: 1 }, token)
      .then((response) => {
        const summary = response.data[0]
        return summary ? inventoryClosuresService.get(summary.id, token) : null
      })
      .then((closure) => {
        if (!cancelled) setResult({ key: requestKey, status: 'success', closure, error: null })
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setResult({
          key: requestKey,
          status: 'error',
          closure: null,
          error: resolveClosureError(
            err,
            'No fue posible revisar el cierre de hoy. Intenta de nuevo.',
          ),
        })
      })
    return () => {
      cancelled = true
    }
  }, [branchId, requestKey, today, token])

  const refetch = useCallback(() => setReloadToken((value) => value + 1), [])

  const replace = useCallback(
    (closure: InventoryClosure) =>
      setResult({ key: requestKey, status: 'success', closure, error: null }),
    [requestKey],
  )

  if (!branchId) {
    return { status: 'idle' as const, closure: null, error: null, today, refetch, replace }
  }
  const isCurrent = result?.key === requestKey
  return {
    status: isCurrent ? result.status : ('loading' as const),
    closure: isCurrent ? result.closure : null,
    error: isCurrent ? result.error : null,
    today,
    refetch,
    replace,
  }
}
