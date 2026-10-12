import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { SearchBar } from './SearchBar'

function searchBar(value: string, onSearch: (term: string) => void, minLength?: number) {
  return (
    <SearchBar
      id="test-search"
      label="Buscar por nombre"
      placeholder="Buscar por nombre"
      value={value}
      onSearch={onSearch}
      minLength={minLength}
    />
  )
}

function renderSearchBar(value = '', minLength?: number) {
  const onSearch = vi.fn()
  const user = userEvent.setup()
  const view = render(searchBar(value, onSearch, minLength))
  const applyValue = (next: string) => view.rerender(searchBar(next, onSearch, minLength))
  return { user, onSearch, applyValue, ...view }
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

describe('SearchBar minimum length', () => {
  it('accepts a term that has exactly the minimum length', async () => {
    const { user, onSearch } = renderSearchBar()

    await user.type(input(), 'ma{Enter}')

    expect(onSearch).toHaveBeenCalledWith('ma')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('measures the length after trimming the spaces', async () => {
    const { user, onSearch } = renderSearchBar()

    await user.type(input(), '  m  {Enter}')

    expect(screen.getByRole('alert')).toBeInTheDocument()
    expect(onSearch).not.toHaveBeenCalled()
  })

  it('uses the minimum length it receives in the rule and in the message', async () => {
    const { user, onSearch } = renderSearchBar('', 3)

    await user.type(input(), 'ab{Enter}')

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Escribe al menos 3 caracteres para buscar.',
    )
    expect(onSearch).not.toHaveBeenCalled()

    await user.type(input(), 'c{Enter}')

    expect(onSearch).toHaveBeenCalledWith('abc')
  })

  it('searches everything when the text is only spaces', async () => {
    const { user, onSearch } = renderSearchBar()

    await user.type(input(), '   {Enter}')

    expect(onSearch).toHaveBeenCalledWith('')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('searches the corrected text once, after the error', async () => {
    const { user, onSearch } = renderSearchBar()

    await user.type(input(), 'm{Enter}')
    await user.type(input(), 'a{Enter}')

    expect(onSearch).toHaveBeenCalledTimes(1)
    expect(onSearch).toHaveBeenCalledWith('ma')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('links the field to the error only while it is shown', async () => {
    const { user } = renderSearchBar()
    expect(input()).not.toHaveAttribute('aria-describedby')

    await user.type(input(), 'm{Enter}')

    expect(input()).toHaveAccessibleDescription('Escribe al menos 2 caracteres para buscar.')

    await user.type(input(), 'a')

    expect(input()).not.toHaveAttribute('aria-describedby')
  })

  it('hides the error when the text is cleared with the clear button', async () => {
    const { user, onSearch } = renderSearchBar()

    await user.type(input(), 'm{Enter}')
    await user.click(screen.getByRole('button', { name: 'Limpiar búsqueda' }))

    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(input()).toHaveAttribute('aria-invalid', 'false')
    expect(input()).toHaveValue('')
    expect(onSearch).not.toHaveBeenCalled()
  })
})

describe('SearchBar applied value', () => {
  it('replaces the draft and does not search when the value changes from outside', () => {
    const { applyValue, onSearch } = renderSearchBar('makro')

    applyValue('viva')

    expect(input()).toHaveValue('viva')
    expect(onSearch).not.toHaveBeenCalled()
  })

  it('hides the error when the value changes from outside', async () => {
    const { user, applyValue } = renderSearchBar()
    await user.type(input(), 'm{Enter}')

    applyValue('makro')

    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(input()).toHaveAttribute('aria-invalid', 'false')
  })

  it('keeps what the user is typing when the applied value does not change', async () => {
    const { user, applyValue, onSearch } = renderSearchBar('makro')

    await user.type(input(), ' vi')
    applyValue('makro')

    expect(input()).toHaveValue('makro vi')
    expect(onSearch).not.toHaveBeenCalled()
  })

  it('is exposed as a search landmark with its label', () => {
    renderSearchBar()

    const landmark = screen.getByRole('search')
    expect(landmark).toContainElement(input())
    expect(input()).toHaveAttribute('type', 'search')
    expect(input()).toHaveAttribute('placeholder', 'Buscar por nombre')
    expect(input()).toHaveAttribute('autocomplete', 'off')
  })

  it('does not reload the page when the form is submitted', () => {
    renderSearchBar()

    // dispatchEvent returns false when the submit default action was prevented.
    expect(fireEvent.submit(screen.getByRole('search'))).toBe(false)
  })
})
