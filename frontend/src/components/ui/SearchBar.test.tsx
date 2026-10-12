import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { SearchBar } from './SearchBar'

function renderSearchBar(value = '') {
  const onSearch = vi.fn()
  const user = userEvent.setup()
  const view = render(
    <SearchBar
      id="test-search"
      label="Buscar por nombre"
      placeholder="Buscar por nombre"
      value={value}
      onSearch={onSearch}
    />,
  )
  return { user, onSearch, ...view }
}

function input() {
  return screen.getByRole('searchbox', { name: 'Buscar por nombre' })
}

describe('SearchBar', () => {
  it('does not search while typing', async () => {
    const { user, onSearch } = renderSearchBar()

    await user.type(input(), 'makro')

    expect(onSearch).not.toHaveBeenCalled()
  })

  it('searches the trimmed text when Enter is pressed', async () => {
    const { user, onSearch } = renderSearchBar()

    await user.type(input(), '  makro {Enter}')

    expect(onSearch).toHaveBeenCalledWith('makro')
  })

  it('searches when the magnifier is pressed', async () => {
    const { user, onSearch } = renderSearchBar()

    await user.type(input(), 'viva')
    await user.click(screen.getByRole('button', { name: 'Buscar' }))

    expect(onSearch).toHaveBeenCalledWith('viva')
  })

  it('rejects a search shorter than the minimum length', async () => {
    const { user, onSearch } = renderSearchBar()

    await user.type(input(), 'm{Enter}')

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Escribe al menos 2 caracteres para buscar.',
    )
    expect(input()).toHaveAttribute('aria-invalid', 'true')
    expect(onSearch).not.toHaveBeenCalled()
  })

  it('hides the error once the text changes', async () => {
    const { user } = renderSearchBar()

    await user.type(input(), 'm{Enter}')
    await user.type(input(), 'a')

    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(input()).toHaveAttribute('aria-invalid', 'false')
  })

  it('searches everything again when the text is emptied and confirmed', async () => {
    const { user, onSearch } = renderSearchBar('makro')

    await user.clear(input())
    await user.keyboard('{Enter}')

    expect(onSearch).toHaveBeenCalledWith('')
  })

  it('only shows the clear button when there is text', async () => {
    const { user } = renderSearchBar()

    expect(screen.queryByRole('button', { name: 'Limpiar búsqueda' })).not.toBeInTheDocument()
    await user.type(input(), 'ma')

    expect(screen.getByRole('button', { name: 'Limpiar búsqueda' })).toBeInTheDocument()
  })

  it('clears a draft without searching when nothing was applied', async () => {
    const { user, onSearch } = renderSearchBar()

    await user.type(input(), 'ma')
    await user.click(screen.getByRole('button', { name: 'Limpiar búsqueda' }))

    expect(input()).toHaveValue('')
    expect(onSearch).not.toHaveBeenCalled()
  })

  it('removes an applied search with the clear button', async () => {
    const { user, onSearch } = renderSearchBar('makro')

    await user.click(screen.getByRole('button', { name: 'Limpiar búsqueda' }))

    expect(input()).toHaveValue('')
    expect(onSearch).toHaveBeenCalledWith('')
  })

  it('shows the applied value when it changes from outside', () => {
    const onSearch = vi.fn()
    const { rerender } = render(
      <SearchBar id="s" label="Buscar" placeholder="Buscar" value="makro" onSearch={onSearch} />,
    )

    rerender(<SearchBar id="s" label="Buscar" placeholder="Buscar" value="" onSearch={onSearch} />)

    expect(screen.getByRole('searchbox', { name: 'Buscar' })).toHaveValue('')
  })
})
