import { useCallback, useEffect, useState } from 'react'

import { ApiError } from '../services/http'
import { usersService } from '../services/users.service'
import type { User } from '../types/user'

import { useAuth } from './useAuth'

type RequestStatus = 'loading' | 'success' | 'not-found' | 'error'

interface UserResult {
  key: string
  status: Exclude<RequestStatus, 'loading'>
  user: User | null
  error: string | null
}

export function useUser(userId: string | undefined) {
  const { token } = useAuth()
  const [result, setResult] = useState<UserResult | null>(null)
  const [reloadToken, setReloadToken] = useState(0)
  const requestKey = `${userId ?? ''}|${token ?? ''}|${reloadToken}`

  useEffect(() => {
    if (!userId) return
    let cancelled = false
    usersService
      .getById(userId, token)
      .then((user) => {
        if (cancelled) return
        setResult({ key: requestKey, status: 'success', user, error: null })
      })
      .catch((err: unknown) => {
        if (cancelled) return
        const notFound = err instanceof ApiError && (err.status === 404 || err.status === 400)
        setResult({
          key: requestKey,
          status: notFound ? 'not-found' : 'error',
          user: null,
          error:
            err instanceof Error
              ? err.message
              : 'No fue posible cargar el usuario. Intenta de nuevo.',
        })
      })
    return () => {
      cancelled = true
    }
  }, [requestKey, userId, token])

  const refetch = useCallback(() => {
    setReloadToken((value) => value + 1)
  }, [])

  const isCurrent = result !== null && result.key === requestKey
  const previousUser = result !== null && result.user?.id === userId ? result.user : null
  const isRefreshing = !isCurrent && previousUser !== null

  let status: RequestStatus = 'loading'
  if (!userId) status = 'not-found'
  else if (isCurrent && result) status = result.status
  else if (isRefreshing) status = 'success'

  return {
    status,
    user: isCurrent && result ? result.user : previousUser,
    error: isCurrent && result ? result.error : null,
    isRefreshing,
    refetch,
  }
}
