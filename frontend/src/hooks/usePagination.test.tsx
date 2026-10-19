import { act, renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { describe, expect, it } from 'vitest'

import { usePagination } from './usePagination'

const DEFAULTS = { estado: 'todos', rol: 'todos' }

function setup(initialEntry = '/lista') {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <MemoryRouter initialEntries={[initialEntry]}>{children}</MemoryRouter>
  )
  return renderHook(
    () => ({ pagination: usePagination({ filters: DEFAULTS }), location: useLocation() }),
    { wrapper },
  )
}

describe('usePagination', () => {
  it('starts on the first page without filters', () => {
    const { result } = setup()

    expect(result.current.pagination).toMatchObject({
      page: 1,
      search: '',
      filters: DEFAULTS,
      hasFilters: false,
    })
  })

  it('reads the page, search and filters from the URL', () => {
    const { result } = setup('/lista?pagina=3&q=makro&estado=activos')

    expect(result.current.pagination).toMatchObject({
      page: 3,
      search: 'makro',
      filters: { estado: 'activos', rol: 'todos' },
      hasFilters: true,
    })
  })

  it('applies a trimmed search and goes back to the first page', () => {
    const { result } = setup('/lista?pagina=3')

    act(() => result.current.pagination.applySearch('  viva '))

    expect(result.current.location.search).toBe('?q=viva')
    expect(result.current.pagination.page).toBe(1)
  })

  it('removes the search when it is empty', () => {
    const { result } = setup('/lista?q=viva')

    act(() => result.current.pagination.applySearch(''))

    expect(result.current.location.search).toBe('')
  })

  it('changes a filter, resets the page and removes it when it goes back to "todos"', () => {
    const { result } = setup('/lista?pagina=2')

    act(() => result.current.pagination.setFilter('estado', 'inactivos'))
    expect(result.current.location.search).toBe('?estado=inactivos')

    act(() => result.current.pagination.setFilter('estado', 'todos'))
    expect(result.current.location.search).toBe('')
  })

  it('moves between pages keeping the filters', () => {
    const { result } = setup('/lista?q=viva')

    act(() => result.current.pagination.setPage(2))
    expect(result.current.location.search).toBe('?q=viva&pagina=2')

    act(() => result.current.pagination.setPage(1))
    expect(result.current.location.search).toBe('?q=viva')
  })

  it('clears the search and every filter at once', () => {
    const { result } = setup('/lista?q=viva&estado=activos&rol=role-1&pagina=4')

    act(() => result.current.pagination.clearFilters())

    expect(result.current.location.search).toBe('')
    expect(result.current.pagination.hasFilters).toBe(false)
  })

  it('uses the default page size and exposes the request params', () => {
    const { result } = setup('/lista?pagina=2&q=viva')

    expect(result.current.pagination.limit).toBe(10)
    expect(result.current.pagination.params).toEqual({ page: 2, limit: 10, search: 'viva' })
  })

  it('reads an allowed page size from the URL and ignores any other value', () => {
    const { result: allowed } = setup('/lista?porPagina=50')
    const { result: invalid } = setup('/lista?porPagina=500')

    expect(allowed.current.pagination.limit).toBe(50)
    expect(invalid.current.pagination.limit).toBe(10)
  })

  it('ignores an invalid page in the URL', () => {
    const { result } = setup('/lista?pagina=-3')

    expect(result.current.pagination.page).toBe(1)
  })

  it('changes the page size, goes back to the first page and drops the default', () => {
    const { result } = setup('/lista?pagina=3')

    act(() => result.current.pagination.setLimit(20))
    expect(result.current.location.search).toBe('?porPagina=20')
    expect(result.current.pagination.params).toEqual({ page: 1, limit: 20, search: undefined })

    act(() => result.current.pagination.setLimit(10))
    expect(result.current.location.search).toBe('')
  })

  it('keeps the page size when the filters are cleared', () => {
    const { result } = setup('/lista?q=viva&porPagina=20&pagina=2')

    act(() => result.current.pagination.clearFilters())

    expect(result.current.location.search).toBe('?porPagina=20')
  })
})
