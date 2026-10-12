import { useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'

const PAGE_PARAM = 'pagina'
const SEARCH_PARAM = 'q'
const ALL = 'todos'

type FilterValues<F extends string> = Record<F, string>

interface UsePaginationOptions<F extends string> {
  filters: FilterValues<F>
}

export function usePagination<F extends string = never>({
  filters: defaults,
}: UsePaginationOptions<F>) {
  const [searchParams, setSearchParams] = useSearchParams()

  const page = Math.max(1, Number(searchParams.get(PAGE_PARAM)) || 1)
  const search = searchParams.get(SEARCH_PARAM) ?? ''
  const filters = Object.fromEntries(
    (Object.keys(defaults) as F[]).map((key) => [key, searchParams.get(key) ?? defaults[key]]),
  ) as FilterValues<F>

  const hasFilters =
    search !== '' || (Object.keys(defaults) as F[]).some((key) => filters[key] !== defaults[key])

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

  return { page, search, filters, hasFilters, setPage, applySearch, setFilter, clearFilters }
}
