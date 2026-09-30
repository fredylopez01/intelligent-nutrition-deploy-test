import { useCallback, useEffect, useState } from 'react'

import { suppliersService } from '../services/suppliers.service'
import type { Supplier, SuppliersListParams } from '../types/supplier'
import type { PaginationMeta } from '../types/user'

import { useAuth } from './useAuth'

type RequestStatus = 'loading' | 'success' | 'error'

interface SuppliersResult {
  key: string
  status: Exclude<RequestStatus, 'loading'>
  suppliers: Supplier[]
  meta: PaginationMeta | null
  error: string | null
}

export function useSuppliers({ page, limit, search, active }: SuppliersListParams) {
  const { token } = useAuth()
  const [result, setResult] = useState<SuppliersResult | null>(null)
  const [reloadToken, setReloadToken] = useState(0)
  const requestKey = `${page ?? 1}|${limit ?? 10}|${search ?? ''}|${active ?? 'todos'}|${token ?? ''}|${reloadToken}`

  useEffect(() => {
    let cancelled = false
    suppliersService
      .list({ page, limit, search, active }, token)
      .then((response) => {
        if (cancelled) return
        setResult({
          key: requestKey,
          status: 'success',
          suppliers: response.data,
          meta: response.meta,
          error: null,
        })
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setResult({
          key: requestKey,
          status: 'error',
          suppliers: [],
          meta: null,
          error:
            err instanceof Error
              ? err.message
              : 'No fue posible cargar los proveedores. Intenta de nuevo.',
        })
      })
    return () => {
      cancelled = true
    }
  }, [requestKey, page, limit, search, active, token])

  const isCurrent = result?.key === requestKey
  const refetch = useCallback(() => setReloadToken((v) => v + 1), [])

  return {
    status: isCurrent ? result.status : ('loading' as RequestStatus),
    suppliers: isCurrent ? result.suppliers : [],
    meta: isCurrent ? result.meta : null,
    error: isCurrent ? result.error : null,
    refetch,
  }
}
