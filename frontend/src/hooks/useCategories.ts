import { useCallback, useEffect, useState } from 'react'

import { categoriesService } from '../services/categories.service'
import type { CategoriesListParams, Category } from '../types/category'
import type { PaginationMeta } from '../types/user'
import { resolveCategoryError } from '../utils/categories'

import { useAuth } from './useAuth'

type RequestStatus = 'loading' | 'success' | 'error'

interface CategoriesResult {
  key: string
  status: Exclude<RequestStatus, 'loading'>
  categories: Category[]
  meta: PaginationMeta | null
  error: string | null
}

export function useCategories({ page, limit, search, active }: CategoriesListParams) {
  const { token } = useAuth()
  const [result, setResult] = useState<CategoriesResult | null>(null)
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
    categoriesService
      .list({ page, limit, search, active }, token)
      .then((response) => {
        if (cancelled) return
        setResult({
          key: requestKey,
          status: 'success',
          categories: response.data,
          meta: response.meta,
          error: null,
        })
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setResult({
          key: requestKey,
          status: 'error',
          categories: [],
          meta: null,
          error: resolveCategoryError(
            err,
            'No fue posible cargar las categorías. Intenta de nuevo.',
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
    categories: isCurrent ? result.categories : [],
    meta: isCurrent ? result.meta : null,
    error: isCurrent ? result.error : null,
    refetch,
  }
}
