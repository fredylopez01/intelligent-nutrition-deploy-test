import { useCallback, useEffect, useState } from 'react'

import { inventoryService } from '../services/inventory.service'
import type { ConsolidatedItem, ConsolidatedParams } from '../types/inventory'
import type { PaginationMeta } from '../types/user'
import { resolveInventoryError } from '../utils/inventory'

import { useAuth } from './useAuth'

type RequestStatus = 'loading' | 'success' | 'error'

interface ConsolidatedResult {
  key: string
  status: Exclude<RequestStatus, 'loading'>
  items: ConsolidatedItem[]
  meta: PaginationMeta | null
  error: string | null
}

export function useConsolidatedInventory({ page, limit, search, categoryId }: ConsolidatedParams) {
  const { token } = useAuth()
  const [result, setResult] = useState<ConsolidatedResult | null>(null)
  const [reloadToken, setReloadToken] = useState(0)
  const requestKey = [
    page ?? 1,
    limit ?? 10,
    search ?? '',
    categoryId ?? '',
    token ?? '',
    reloadToken,
  ].join('|')

  useEffect(() => {
    let cancelled = false
    inventoryService
      .consolidated({ page, limit, search, categoryId }, token)
      .then((response) => {
        if (cancelled) return
        setResult({
          key: requestKey,
          status: 'success',
          items: response.data,
          meta: response.meta,
          error: null,
        })
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setResult({
          key: requestKey,
          status: 'error',
          items: [],
          meta: null,
          error: resolveInventoryError(
            err,
            'No fue posible cargar el inventario consolidado. Intenta de nuevo.',
          ),
        })
      })
    return () => {
      cancelled = true
    }
  }, [requestKey, page, limit, search, categoryId, token])

  const refetch = useCallback(() => {
    setReloadToken((value) => value + 1)
  }, [])

  const isCurrent = result?.key === requestKey

  return {
    status: isCurrent ? result.status : ('loading' as RequestStatus),
    items: isCurrent ? result.items : [],
    meta: isCurrent ? result.meta : null,
    error: isCurrent ? result.error : null,
    refetch,
  }
}
