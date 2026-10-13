import { useCallback, useEffect, useState } from 'react'

import { productsService } from '../services/products.service'
import type { Product, ProductsListParams } from '../types/product'
import type { PaginationMeta } from '../types/user'
import { resolveProductError } from '../utils/products'

import { useAuth } from './useAuth'

type RequestStatus = 'loading' | 'success' | 'error'

interface ProductsResult {
  key: string
  status: Exclude<RequestStatus, 'loading'>
  products: Product[]
  meta: PaginationMeta | null
  error: string | null
}

export function useProducts({
  page,
  limit,
  search,
  categoryId,
  unitOfMeasureId,
  active,
}: ProductsListParams) {
  const { token } = useAuth()
  const [result, setResult] = useState<ProductsResult | null>(null)
  const [reloadToken, setReloadToken] = useState(0)
  const requestKey = [
    page ?? 1,
    limit ?? 10,
    search ?? '',
    categoryId ?? '',
    unitOfMeasureId ?? '',
    active ?? 'todos',
    token ?? '',
    reloadToken,
  ].join('|')

  useEffect(() => {
    let cancelled = false
    productsService
      .list({ page, limit, search, categoryId, unitOfMeasureId, active }, token)
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
          error: resolveProductError(err, 'No fue posible cargar los productos. Intenta de nuevo.'),
        })
      })
    return () => {
      cancelled = true
    }
  }, [requestKey, page, limit, search, categoryId, unitOfMeasureId, active, token])

  const refetch = useCallback(() => {
    setReloadToken((value) => value + 1)
  }, [])

  const isCurrent = result?.key === requestKey

  return {
    status: isCurrent ? result.status : ('loading' as RequestStatus),
    products: isCurrent ? result.products : [],
    meta: isCurrent ? result.meta : null,
    error: isCurrent ? result.error : null,
    refetch,
  }
}
