import { useCallback, useEffect, useState } from 'react'

import { usersService } from '../services/users.service'
import type { UserBranchAssignment } from '../types/user'

import { useAuth } from './useAuth'

type RequestStatus = 'idle' | 'loading' | 'success' | 'error'

interface AssignmentsResult {
  key: string
  status: Exclude<RequestStatus, 'idle' | 'loading'>
  assignments: UserBranchAssignment[]
  error: string | null
}

export function useUserBranches(userId: string | null) {
  const { token } = useAuth()
  const [result, setResult] = useState<AssignmentsResult | null>(null)
  const [reloadToken, setReloadToken] = useState(0)
  const requestKey = `${userId ?? ''}|${token ?? ''}|${reloadToken}`

  useEffect(() => {
    if (!userId) return
    let cancelled = false
    usersService
      .listBranches(userId, token)
      .then((assignments) => {
        if (cancelled) return
        setResult({ key: requestKey, status: 'success', assignments, error: null })
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setResult({
          key: requestKey,
          status: 'error',
          assignments: [],
          error:
            err instanceof Error ? err.message : 'No fue posible cargar las sedes del usuario.',
        })
      })
    return () => {
      cancelled = true
    }
  }, [requestKey, userId, token])

  const refetch = useCallback(() => {
    setReloadToken((value) => value + 1)
  }, [])

  const isCurrent = result?.key === requestKey

  return {
    status: !userId ? ('idle' as RequestStatus) : isCurrent ? result.status : 'loading',
    assignments: isCurrent ? result.assignments : [],
    error: isCurrent ? result.error : null,
    refetch,
  }
}
