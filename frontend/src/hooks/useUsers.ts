import { useCallback, useEffect, useState } from 'react'

import { usersService } from '../services/users.service'
import type { PaginationMeta, User, UsersListParams } from '../types/user'

import { useAuth } from './useAuth'

type RequestStatus = 'loading' | 'success' | 'error'

interface UsersResult {
  key: string
  status: Exclude<RequestStatus, 'loading'>
  users: User[]
  meta: PaginationMeta | null
  emptyMessage: string | null
  error: string | null
}

export function useUsers({ page, limit, active }: UsersListParams) {
  const { token } = useAuth()
  const [result, setResult] = useState<UsersResult | null>(null)
  const [reloadToken, setReloadToken] = useState(0)
  const requestKey = `${page ?? 1}|${limit ?? 10}|${active ?? 'todos'}|${token ?? ''}|${reloadToken}`
  useEffect(() => {
    let cancelled = false
    usersService
      .list({ page, limit, active }, token)
      .then((response) => {
        if (cancelled) return
        setResult({
          key: requestKey,
          status: 'success',
          users: response.data,
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
          users: [],
          meta: null,
          emptyMessage: null,
          error:
            err instanceof Error
              ? err.message
              : 'No fue posible cargar los usuarios. Intenta de nuevo.',
        })
      })
    return () => {
      cancelled = true
    }
  }, [requestKey, page, limit, active, token])
  const refetch = useCallback(() => {
    setReloadToken((value) => value + 1)
  }, [])
  const isCurrent = result?.key === requestKey
  return {
    status: isCurrent ? result.status : ('loading' as RequestStatus),
    users: isCurrent ? result.users : [],
    meta: isCurrent ? result.meta : null,
    emptyMessage: isCurrent ? result.emptyMessage : null,
    error: isCurrent ? result.error : null,
    refetch,
  }
}
