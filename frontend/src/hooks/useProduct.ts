import { useCallback, useEffect, useState } from 'react'

import { ApiError } from '../services/http'
import { productsService } from '../services/products.service'
import type { Product } from '../types/product'
import { resolveProductError } from '../utils/products'

import { useAuth } from './useAuth'

type RequestStatus = 'loading' | 'success' | 'not-found' | 'error'

interface ProductResult {
  key: string
  status: Exclude<RequestStatus, 'loading'>
  product: Product | null
  error: string | null
}

export function useProduct(productId: string | undefined) {
  const { token } = useAuth()
  const [result, setResult] = useState<ProductResult | null>(null)
  const [reloadToken, setReloadToken] = useState(0)
  const requestKey = `${productId ?? ''}|${token ?? ''}|${reloadToken}`

  useEffect(() => {
    if (!productId) return
    let cancelled = false
    productsService
      .getById(productId, token)
      .then((product) => {
        if (cancelled) return
        setResult({ key: requestKey, status: 'success', product, error: null })
      })
      .catch((err: unknown) => {
        if (cancelled) return
        const notFound = err instanceof ApiError && (err.status === 404 || err.status === 400)
        setResult({
          key: requestKey,
          status: notFound ? 'not-found' : 'error',
          product: null,
          error: resolveProductError(err, 'No fue posible cargar el producto. Intenta de nuevo.'),
        })
      })
    return () => {
      cancelled = true
    }
  }, [requestKey, productId, token])

  const refetch = useCallback(() => {
    setReloadToken((value) => value + 1)
  }, [])

  const isCurrent = result !== null && result.key === requestKey
  const previousProduct =
    result !== null && result.product?.id === productId ? result.product : null
  const isRefreshing = !isCurrent && previousProduct !== null

  let status: RequestStatus = 'loading'
  if (!productId) status = 'not-found'
  else if (isCurrent && result) status = result.status
  else if (isRefreshing) status = 'success'

  return {
    status,
    product: isCurrent && result ? result.product : previousProduct,
    error: isCurrent && result ? result.error : null,
    isRefreshing,
    refetch,
  }
}
