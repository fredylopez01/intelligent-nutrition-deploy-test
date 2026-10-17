import { useCallback, useEffect, useState } from 'react'

import { inventoryService } from '../services/inventory.service'
import type { BranchInventoryItem, BranchInventoryParams } from '../types/inventory'
import type { PaginationMeta } from '../types/user'
import { resolveInventoryError } from '../utils/inventory'

import { useAuth } from './useAuth'

type RequestStatus = 'idle' | 'loading' | 'success' | 'error'

interface InventoryResult {
  key: string
  status: 'success' | 'error'
  items: BranchInventoryItem[]
  meta: PaginationMeta | null
  error: string | null
}

export function useBranchInventory(
  branchId: string | null,
  { page, limit, search, categoryId, lowStock }: BranchInventoryParams,
) {
  const { token } = useAuth()
  const [result, setResult] = useState<InventoryResult | null>(null)
  const [reloadToken, setReloadToken] = useState(0)
  const requestKey = [
    branchId ?? '',
    page ?? 1,
    limit ?? 10,
    search ?? '',
    categoryId ?? '',
    lowStock ?? 'todos',
    token ?? '',
    reloadToken,
  ].join('|')

  useEffect(() => {
    if (!branchId) return
    let cancelled = false
    inventoryService
      .listByBranch(branchId, { page, limit, search, categoryId, lowStock }, token)
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
            'No fue posible cargar el inventario de la sede. Intenta de nuevo.',
          ),
        })
      })
    return () => {
      cancelled = true
    }
  }, [requestKey, branchId, page, limit, search, categoryId, lowStock, token])

  const refetch = useCallback(() => {
    setReloadToken((value) => value + 1)
  }, [])

  const isCurrent = result?.key === requestKey
  let status: RequestStatus = 'loading'
  if (!branchId) status = 'idle'
  else if (isCurrent) status = result.status

  return {
    status,
    items: isCurrent ? result.items : [],
    meta: isCurrent ? result.meta : null,
    error: isCurrent ? result.error : null,
    refetch,
  }
}
