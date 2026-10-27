import { useCallback, useEffect, useState } from 'react'

import { salesService } from '../services/sales.service'
import type { SaleSummary, SalesListParams } from '../types/sale'
import type { PaginationMeta } from '../types/user'
import { resolveSaleError } from '../utils/sales'

import { useAuth } from './useAuth'

interface SalesResult {
  key: string
  status: 'success' | 'error'
  sales: SaleSummary[]
  meta: PaginationMeta | null
  error: string | null
}

export function useSales(params: SalesListParams, enabled = true) {
  const { token } = useAuth()
  const [result, setResult] = useState<SalesResult | null>(null)
  const [reloadToken, setReloadToken] = useState(0)
  const { page, limit, branchId, status, from, to, search } = params
  const requestKey = [
    page ?? 1,
    limit ?? 20,
    branchId ?? '',
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
    salesService
      .list({ page, limit, branchId, status, from, to, search }, token)
      .then((response) => {
        if (cancelled) return
        setResult({
          key: requestKey,
          status: 'success',
          sales: response.data,
          meta: response.meta,
          error: null,
        })
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setResult({
          key: requestKey,
          status: 'error',
          sales: [],
          meta: null,
          error: resolveSaleError(err, 'No fue posible cargar las ventas. Intenta de nuevo.'),
        })
      })
    return () => {
      cancelled = true
    }
  }, [enabled, requestKey, page, limit, branchId, status, from, to, search, token])

  const refetch = useCallback(() => setReloadToken((value) => value + 1), [])

  const isCurrent = result?.key === requestKey
  return {
    status: !enabled ? ('idle' as const) : isCurrent ? result.status : ('loading' as const),
    sales: isCurrent ? result.sales : [],
    meta: isCurrent ? result.meta : null,
    error: isCurrent ? result.error : null,
    refetch,
  }
}
