import { useCallback, useEffect, useState } from 'react'

import { salesService } from '../services/sales.service'
import type { SellableProduct, SellableProductsParams } from '../types/sale'
import type { PaginationMeta } from '../types/user'
import { resolveSaleError } from '../utils/sales'

import { useAuth } from './useAuth'

interface SellableResult {
  key: string
  status: 'success' | 'error'
  products: SellableProduct[]
  meta: PaginationMeta | null
  error: string | null
}

export function useSellableProducts(branchId: string | null, params: SellableProductsParams) {
  const { token } = useAuth()
  const [result, setResult] = useState<SellableResult | null>(null)
  const [reloadToken, setReloadToken] = useState(0)
  const { page, limit, search, categoryId } = params
  const requestKey = [
    branchId ?? '',
    page ?? 1,
    limit ?? 12,
    search ?? '',
    categoryId ?? '',
    token ?? '',
    reloadToken,
  ].join('|')

  useEffect(() => {
    if (!branchId) return
    let cancelled = false
    salesService
      .sellableProducts(branchId, { page, limit, search, categoryId }, token)
      .then((response) => {
        if (cancelled) return
        setResult({
          key: requestKey,
          status: 'success',
          products: response.data,
          meta: response.meta,
          error: null,
        })
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setResult({
          key: requestKey,
          status: 'error',
          products: [],
          meta: null,
          error: resolveSaleError(err, 'No fue posible cargar los productos. Intenta de nuevo.'),
        })
      })
    return () => {
      cancelled = true
    }
  }, [branchId, requestKey, page, limit, search, categoryId, token])

  const refetch = useCallback(() => setReloadToken((value) => value + 1), [])

  if (!branchId) {
    return { status: 'idle' as const, products: [], meta: null, error: null, refetch }
  }
  const isCurrent = result?.key === requestKey
  return {
    status: isCurrent ? result.status : ('loading' as const),
    products: isCurrent ? result.products : [],
    meta: isCurrent ? result.meta : null,
    error: isCurrent ? result.error : null,
    refetch,
  }
}
