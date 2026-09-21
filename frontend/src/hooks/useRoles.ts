import { useCallback, useEffect, useState } from 'react'

import { rolesService } from '../services/roles.service'
import type { Role } from '../types/user'

import { useAuth } from './useAuth'

interface RolesResult {
  key: string
  roles: Role[]
  error: string | null
}

export function useRoles() {
  const { token } = useAuth()
  const [result, setResult] = useState<RolesResult | null>(null)
  const [reloadToken, setReloadToken] = useState(0)
  const requestKey = `${token ?? ''}|${reloadToken}`

  useEffect(() => {
    let cancelled = false

    rolesService
      .list(token)
      .then((roles) => {
        if (cancelled) return
        setResult({ key: requestKey, roles, error: null })
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setResult({
          key: requestKey,
          roles: [],
          error: err instanceof Error ? err.message : 'No fue posible cargar los roles.',
        })
      })

    return () => {
      cancelled = true
    }
  }, [requestKey, token])
  const refetch = useCallback(() => {
    setReloadToken((value) => value + 1)
  }, [])
  const isCurrent = result?.key === requestKey

  return {
    roles: isCurrent ? result.roles : [],
    isLoading: !isCurrent,
    error: isCurrent ? result.error : null,
    refetch,
  }
}
