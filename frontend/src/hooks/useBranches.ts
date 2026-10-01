import { useCallback, useEffect, useState } from 'react'

import { branchesService } from '../services/branches.service'
import type { Branch, BranchesListParams, BranchesPaginationMeta } from '../types/branch'

import { useAuth } from './useAuth'

type RequestStatus = 'loading' | 'success' | 'error'

interface BranchesResult {
  key: string
  status: Exclude<RequestStatus, 'loading'>
  branches: Branch[]
  meta: BranchesPaginationMeta | null
  emptyMessage: string | null
  error: string | null
}

export function useBranches({ page, limit, search, active }: BranchesListParams) {
  const { token } = useAuth()
  const [result, setResult] = useState<BranchesResult | null>(null)
  const [reloadToken, setReloadToken] = useState(0)
  const requestKey = `${page ?? 1}|${limit ?? 10}|${search ?? ''}|${active ?? 'todos'}|${token ?? ''}|${reloadToken}`

  useEffect(() => {
    let cancelled = false
    branchesService
      .list({ page, limit, search, active }, token)
      .then((response) => {
        if (cancelled) return
        setResult({
          key: requestKey,
          status: 'success',
          branches: response.data,
          meta: response.meta,
          emptyMessage: response.message ?? null,
          error: null,
        })
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setResult({
          key: requestKey,
          status: 'error',
          branches: [],
          meta: null,
          emptyMessage: null,
          error:
            err instanceof Error
              ? err.message
              : 'No fue posible cargar las sedes. Intenta de nuevo.',
        })
      })
    return () => {
      cancelled = true
    }
  }, [requestKey, page, limit, search, active, token])

  const refetch = useCallback(() => {
    setReloadToken((value) => value + 1)
  }, [])
  const isCurrent = result?.key === requestKey

  return {
    status: isCurrent ? result.status : ('loading' as RequestStatus),
    branches: isCurrent ? result.branches : [],
    meta: isCurrent ? result.meta : null,
    emptyMessage: isCurrent ? result.emptyMessage : null,
    error: isCurrent ? result.error : null,
    refetch,
  }
}
