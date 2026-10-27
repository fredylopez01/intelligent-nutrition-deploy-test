import { useCallback, useEffect, useState } from 'react'

import { purchasesService } from '../services/purchases.service'
import type { PurchaseSummary, PurchasesListParams } from '../types/purchase'
import type { PaginationMeta } from '../types/user'
import { resolvePurchaseError } from '../utils/purchases'

import { useAuth } from './useAuth'

interface PurchasesResult {
  key: string
  status: 'success' | 'error'
  purchases: PurchaseSummary[]
  meta: PaginationMeta | null
  error: string | null
}

export function usePurchases(params: PurchasesListParams, enabled = true) {
  const { token } = useAuth()
  const [result, setResult] = useState<PurchasesResult | null>(null)
  const [reloadToken, setReloadToken] = useState(0)
  const { page, limit, supplierId, status, from, to, search } = params
  const requestKey = [
    page ?? 1,
    limit ?? 20,
    supplierId ?? '',
    status ?? '',
    from ?? '',
    to ?? '',
    search ?? '',
    token ?? '',
    reloadToken,
  ].join('|')

  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    purchasesService
      .list({ page, limit, supplierId, status, from, to, search }, token)
      .then((response) => {
        if (cancelled) return
        setResult({
          key: requestKey,
          status: 'success',
          purchases: response.data,
          meta: response.meta,
          error: null,
        })
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setResult({
          key: requestKey,
          status: 'error',
          purchases: [],
          meta: null,
          error: resolvePurchaseError(err, 'No fue posible cargar las compras. Intenta de nuevo.'),
        })
      })
    return () => {
      cancelled = true
    }
  }, [enabled, requestKey, page, limit, supplierId, status, from, to, search, token])

  const refetch = useCallback(() => setReloadToken((value) => value + 1), [])

  const isCurrent = result?.key === requestKey
  return {
    status: !enabled ? ('idle' as const) : isCurrent ? result.status : ('loading' as const),
    purchases: isCurrent ? result.purchases : [],
    meta: isCurrent ? result.meta : null,
    error: isCurrent ? result.error : null,
    refetch,
  }
}
