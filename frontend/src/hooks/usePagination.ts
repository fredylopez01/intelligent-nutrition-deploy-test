import { useCallback, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'

const PAGE_PARAM = 'pagina'
const LIMIT_PARAM = 'porPagina'
const SEARCH_PARAM = 'q'
const ALL = 'todos'

export const DEFAULT_LIMIT_OPTIONS = [10, 20, 50]

type FilterValues<F extends string> = Record<F, string>

interface UsePaginationOptions<F extends string> {
  filters: FilterValues<F>
  defaultLimit?: number
  limitOptions?: number[]
}

export interface PaginationParams {
  page: number
  limit: number
  search: string | undefined
}

export function usePagination<F extends string = never>({
  filters: defaults,
  defaultLimit = DEFAULT_LIMIT_OPTIONS[0],
  limitOptions = DEFAULT_LIMIT_OPTIONS,
}: UsePaginationOptions<F>) {
  const [searchParams, setSearchParams] = useSearchParams()

  const page = Math.max(1, Math.trunc(Number(searchParams.get(PAGE_PARAM))) || 1)
  const requestedLimit = Number(searchParams.get(LIMIT_PARAM))
  const limit = limitOptions.includes(requestedLimit) ? requestedLimit : defaultLimit
  const search = searchParams.get(SEARCH_PARAM) ?? ''
  const filters = Object.fromEntries(
    (Object.keys(defaults) as F[]).map((key) => [key, searchParams.get(key) ?? defaults[key]]),
  ) as FilterValues<F>

  const hasFilters =
    search !== '' || (Object.keys(defaults) as F[]).some((key) => filters[key] !== defaults[key])

  const params = useMemo<PaginationParams>(
    () => ({ page, limit, search: search || undefined }),
    [page, limit, search],
  )

  const update = useCallback(
    (changes: Record<string, string | null>, resetPage: boolean) => {
      setSearchParams(
        (previous) => {
          const next = new URLSearchParams(previous)
          for (const [key, value] of Object.entries(changes)) {
            if (value === null || value === '' || value === ALL) next.delete(key)
            else next.set(key, value)
          }
          if (resetPage) next.delete(PAGE_PARAM)
          return next
        },
        { replace: true },
      )
    },
    [setSearchParams],
  )

  const setPage = useCallback(
    (nextPage: number) => update({ [PAGE_PARAM]: nextPage > 1 ? String(nextPage) : null }, false),
    [update],
  )

  const setLimit = useCallback(
    (nextLimit: number) =>
      update({ [LIMIT_PARAM]: nextLimit === defaultLimit ? null : String(nextLimit) }, true),
    [update, defaultLimit],
  )

  const applySearch = useCallback(
    (term: string) => update({ [SEARCH_PARAM]: term.trim() || null }, true),
    [update],
  )

  const setFilter = useCallback((key: F, value: string) => update({ [key]: value }, true), [update])

  const clearFilters = useCallback(() => {
    const cleared: Record<string, null> = { [SEARCH_PARAM]: null }
    for (const key of Object.keys(defaults)) cleared[key] = null
    update(cleared, true)
  }, [update, defaults])

  return {
    page,
    limit,
    limitOptions,
    search,
    filters,
    hasFilters,
    params,
    setPage,
    setLimit,
    applySearch,
    setFilter,
    clearFilters,
  }
}
