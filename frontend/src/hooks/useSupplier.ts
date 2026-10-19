import { useCallback, useEffect, useState } from 'react'

import { ApiError } from '../services/http'
import { suppliersService } from '../services/suppliers.service'
import type { Supplier } from '../types/supplier'
import { resolveSupplierLoadError } from '../utils/suppliers'

import { useAuth } from './useAuth'

type RequestStatus = 'loading' | 'success' | 'not-found' | 'error'

interface SupplierResult {
  key: string
  status: Exclude<RequestStatus, 'loading'>
  supplier: Supplier | null
  error: string | null
}

export function useSupplier(supplierId: string | undefined) {
  const { token } = useAuth()
  const [result, setResult] = useState<SupplierResult | null>(null)
  const [reloadToken, setReloadToken] = useState(0)
  const requestKey = `${supplierId ?? ''}|${token ?? ''}|${reloadToken}`

  useEffect(() => {
    if (!supplierId) return
    let cancelled = false
    suppliersService
      .getById(supplierId, token)
      .then((supplier) => {
        if (cancelled) return
        setResult({ key: requestKey, status: 'success', supplier, error: null })
      })
      .catch((err: unknown) => {
        if (cancelled) return
        const notFound = err instanceof ApiError && (err.status === 404 || err.status === 400)
        setResult({
          key: requestKey,
          status: notFound ? 'not-found' : 'error',
          supplier: null,
          error: resolveSupplierLoadError(
            err,
            'No fue posible cargar el proveedor. Intenta de nuevo.',
          ),
        })
      })
    return () => {
      cancelled = true
    }
  }, [requestKey, supplierId, token])

  const refetch = useCallback(() => {
    setReloadToken((value) => value + 1)
  }, [])

  const isCurrent = result !== null && result.key === requestKey
  const previousSupplier =
    result !== null && result.supplier?.id === supplierId ? result.supplier : null
  const isRefreshing = !isCurrent && previousSupplier !== null

  let status: RequestStatus = 'loading'
  if (!supplierId) status = 'not-found'
  else if (isCurrent && result) status = result.status
  else if (isRefreshing) status = 'success'

  return {
    status,
    supplier: isCurrent && result ? result.supplier : previousSupplier,
    error: isCurrent && result ? result.error : null,
    isRefreshing,
    refetch,
  }
}
