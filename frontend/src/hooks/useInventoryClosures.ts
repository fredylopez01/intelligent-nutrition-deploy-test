import { useCallback, useEffect, useState } from 'react'

import { inventoryClosuresService } from '../services/inventoryClosures.service'
import type { ClosureSummary, ClosuresListParams } from '../types/inventoryClosure'
import type { PaginationMeta } from '../types/user'
import { resolveClosureError } from '../utils/inventoryClosures'

import { useAuth } from './useAuth'

interface ClosuresResult {
  key: string
  status: 'success' | 'error'
  closures: ClosureSummary[]
  meta: PaginationMeta | null
  error: string | null
}

export function useInventoryClosures(params: ClosuresListParams, enabled = true) {
  const { token } = useAuth()
  const [result, setResult] = useState<ClosuresResult | null>(null)
  const [reloadToken, setReloadToken] = useState(0)
  const { page, limit, branchId, status, from, to } = params
  const requestKey = [
    page ?? 1,
    limit ?? 10,
    branchId ?? '',
    status ?? '',
    from ?? '',
    to ?? '',
    token ?? '',
    reloadToken,
  ].join('|')

  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    inventoryClosuresService
      .list({ page, limit, branchId, status, from, to }, token)
      .then((response) => {
        if (cancelled) return
        setResult({
          key: requestKey,
          status: 'success',
          closures: response.data,
          meta: response.meta,
          error: null,
        })
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setResult({
          key: requestKey,
          status: 'error',
          closures: [],
          meta: null,
          error: resolveClosureError(err, 'No fue posible cargar los cierres. Intenta de nuevo.'),
        })
      })
    return () => {
      cancelled = true
    }
  }, [enabled, requestKey, page, limit, branchId, status, from, to, token])

  const refetch = useCallback(() => setReloadToken((value) => value + 1), [])

  const isCurrent = result?.key === requestKey
  return {
    status: !enabled ? ('idle' as const) : isCurrent ? result.status : ('loading' as const),
    closures: isCurrent ? result.closures : [],
    meta: isCurrent ? result.meta : null,
    error: isCurrent ? result.error : null,
    refetch,
  }
}
