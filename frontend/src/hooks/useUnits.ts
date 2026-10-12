import { useCallback, useEffect, useState } from 'react'

import { unitsService } from '../services/units.service'
import type { UnitOfMeasure, UnitsListParams } from '../types/unit'
import type { PaginationMeta } from '../types/user'
import { resolveUnitError } from '../utils/units'

import { useAuth } from './useAuth'

type RequestStatus = 'loading' | 'success' | 'error'

interface UnitsResult {
  key: string
  status: Exclude<RequestStatus, 'loading'>
  units: UnitOfMeasure[]
  meta: PaginationMeta | null
  error: string | null
}

export function useUnits({ page, limit, search, active }: UnitsListParams) {
  const { token } = useAuth()
  const [result, setResult] = useState<UnitsResult | null>(null)
  const [reloadToken, setReloadToken] = useState(0)
  const requestKey = [
    page ?? 1,
    limit ?? 10,
    search ?? '',
    active ?? 'todos',
    token ?? '',
    reloadToken,
  ].join('|')

  useEffect(() => {
    let cancelled = false
    unitsService
      .list({ page, limit, search, active }, token)
      .then((response) => {
        if (cancelled) return
        setResult({
          key: requestKey,
          status: 'success',
          units: response.data,
          meta: response.meta,
          error: null,
        })
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setResult({
          key: requestKey,
          status: 'error',
          units: [],
          meta: null,
          error: resolveUnitError(
            err,
            'No fue posible cargar las unidades de medida. Intenta de nuevo.',
          ),
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
    units: isCurrent ? result.units : [],
    meta: isCurrent ? result.meta : null,
    error: isCurrent ? result.error : null,
    refetch,
  }
}
