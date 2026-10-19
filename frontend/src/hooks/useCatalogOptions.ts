import { useCallback, useEffect, useState } from 'react'

import { categoriesService } from '../services/categories.service'
import { unitsService } from '../services/units.service'
import type { Category } from '../types/category'
import type { UnitOfMeasure } from '../types/unit'

import { useAuth } from './useAuth'

const OPTIONS_LIMIT = 100

interface CatalogOptionsResult {
  key: string
  status: 'success' | 'error'
  categories: Category[]
  units: UnitOfMeasure[]
}

export function useCatalogOptions({ activeOnly }: { activeOnly: boolean }) {
  const { token } = useAuth()
  const [result, setResult] = useState<CatalogOptionsResult | null>(null)
  const [reloadToken, setReloadToken] = useState(0)
  const requestKey = `${activeOnly}|${token ?? ''}|${reloadToken}`

  useEffect(() => {
    let cancelled = false
    const active = activeOnly ? true : undefined
    Promise.all([
      categoriesService.list({ page: 1, limit: OPTIONS_LIMIT, active }, token),
      unitsService.list({ page: 1, limit: OPTIONS_LIMIT, active }, token),
    ])
      .then(([categories, units]) => {
        if (cancelled) return
        setResult({
          key: requestKey,
          status: 'success',
          categories: categories.data,
          units: units.data,
        })
      })
      .catch(() => {
        if (cancelled) return
        setResult({ key: requestKey, status: 'error', categories: [], units: [] })
      })
    return () => {
      cancelled = true
    }
  }, [requestKey, activeOnly, token])

  const reload = useCallback(() => setReloadToken((value) => value + 1), [])
  const isCurrent = result?.key === requestKey

  return {
    status: isCurrent ? result.status : ('loading' as const),
    categories: isCurrent ? result.categories : [],
    units: isCurrent ? result.units : [],
    reload,
  }
}
