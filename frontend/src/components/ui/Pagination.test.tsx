import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { getPageItems } from '../../utils/pagination'

import { Pagination } from './Pagination'

function renderPagination(props: Partial<Parameters<typeof Pagination>[0]> = {}) {
  const onChange = vi.fn()
  const onLimitChange = vi.fn()
  const user = userEvent.setup()
  render(
    <Pagination
      page={1}
      totalPages={5}
      label="Paginación de prueba"
      onChange={onChange}
      {...props}
    />,
  )
  return { user, onChange, onLimitChange }
}

function pageButtons() {
  return within(screen.getByRole('list')).getAllByRole('button')
}

describe('getPageItems', () => {
  it('lists every page when there are few', () => {
    expect(getPageItems(2, 5)).toEqual([1, 2, 3, 4, 5])
  })

  it('collapses the pages far from the current one', () => {
    expect(getPageItems(1, 20)).toEqual([1, 2, 3, 4, 5, 'gap-end', 20])
    expect(getPageItems(10, 20)).toEqual([1, 'gap-start', 9, 10, 11, 'gap-end', 20])
    expect(getPageItems(20, 20)).toEqual([1, 'gap-start', 16, 17, 18, 19, 20])
  })

  it('shows a single hidden page instead of a gap', () => {
    expect(getPageItems(4, 10)).toEqual([1, 2, 3, 4, 5, 'gap-end', 10])
    expect(getPageItems(7, 10)).toEqual([1, 'gap-start', 6, 7, 8, 9, 10])
  })
})

describe('Pagination', () => {
  it('renders nothing with a single page and no page size to change', () => {
    const { container } = render(
      <Pagination page={1} totalPages={1} label="Paginación" onChange={vi.fn()} />,
    )

    expect(container).toBeEmptyDOMElement()
  })

  it('is a labelled navigation that marks the current page for screen readers', () => {
    renderPagination({ page: 3 })

    expect(screen.getByRole('navigation', { name: 'Paginación de prueba' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Página 3 de 5' })).toHaveAttribute(
      'aria-current',
      'page',
    )
    expect(screen.getByRole('button', { name: 'Página 2 de 5' })).not.toHaveAttribute(
      'aria-current',
    )
  })

  it('goes to the chosen, previous and next page', async () => {
    const { user, onChange } = renderPagination({ page: 3 })

    await user.click(screen.getByRole('button', { name: 'Página 5 de 5' }))
    await user.click(screen.getByRole('button', { name: 'Página anterior' }))
    await user.click(screen.getByRole('button', { name: 'Página siguiente' }))

    expect(onChange.mock.calls).toEqual([[5], [2], [4]])
  })

  it('does not reload the current page', async () => {
    const { user, onChange } = renderPagination({ page: 3 })

    await user.click(screen.getByRole('button', { name: 'Página 3 de 5' }))

    expect(onChange).not.toHaveBeenCalled()
  })

  it('disables going back on the first page and forward on the last one', () => {
    const { unmount } = render(
      <Pagination page={1} totalPages={5} label="Primera" onChange={vi.fn()} />,
    )
    expect(screen.getByRole('button', { name: 'Página anterior' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Página siguiente' })).toBeEnabled()
    unmount()

    render(<Pagination page={5} totalPages={5} label="Última" onChange={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Página anterior' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Página siguiente' })).toBeDisabled()
  })

  it('works with the keyboard', async () => {
    const { user, onChange } = renderPagination({ page: 1 })

    await user.tab()
    expect(screen.getByRole('button', { name: 'Página 1 de 5' })).toHaveFocus()
    await user.tab()
    await user.keyboard('{Enter}')
    await user.tab()
    await user.keyboard(' ')

    expect(onChange.mock.calls).toEqual([[2], [3]])
  })

  it('hides the pages that do not fit', () => {
    renderPagination({ page: 10, totalPages: 20 })

    expect(pageButtons().map((button) => button.textContent)).toEqual(['1', '9', '10', '11', '20'])
  })

  it('announces the range of rows shown', () => {
    renderPagination({ page: 3, totalPages: 3, total: 45, limit: 20 })

    expect(screen.getByText('Mostrando 41–45 de 45')).toHaveAttribute('aria-live', 'polite')
  })

  it('changes the page size', async () => {
    const onLimitChange = vi.fn()
    const user = userEvent.setup()
    render(
      <Pagination
        page={2}
        totalPages={3}
        label="Paginación"
        onChange={vi.fn()}
        total={25}
        limit={10}
        limitOptions={[10, 20, 50]}
        onLimitChange={onLimitChange}
      />,
    )

    await user.selectOptions(screen.getByLabelText('Filas por página'), '20')

    expect(onLimitChange).toHaveBeenCalledWith(20)
  })

  it('keeps the page size selector when a bigger size fits every row in one page', () => {
    render(
      <Pagination
        page={1}
        totalPages={1}
        label="Paginación"
        onChange={vi.fn()}
        total={25}
        limit={50}
        limitOptions={[10, 20, 50]}
        onLimitChange={vi.fn()}
      />,
    )

    expect(screen.getByLabelText('Filas por página')).toHaveValue('50')
    expect(screen.queryByRole('button', { name: 'Página siguiente' })).not.toBeInTheDocument()
  })

  it('renders nothing when every row fits in the smallest page size', () => {
    const { container } = render(
      <Pagination
        page={1}
        totalPages={1}
        label="Paginación"
        onChange={vi.fn()}
        total={8}
        limit={10}
        limitOptions={[10, 20, 50]}
        onLimitChange={vi.fn()}
      />,
    )

    expect(container).toBeEmptyDOMElement()
  })
})
