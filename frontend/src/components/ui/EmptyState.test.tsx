import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { Button } from './Button'
import { EmptyState } from './EmptyState'

function icon(container: HTMLElement) {
  return container.querySelector('.ui-empty__icon')
}

describe('EmptyState', () => {
  it('offers to clear the filters in the "sin resultados" variant', async () => {
    const onClearFilters = vi.fn()
    const user = userEvent.setup()
    render(
      <EmptyState
        variant="sin-resultados"
        title="Ninguna sede coincide"
        description="Cambia el filtro"
        onClearFilters={onClearFilters}
      />,
    )

    expect(screen.getByText('Ninguna sede coincide')).toBeInTheDocument()
    expect(screen.getByText('Cambia el filtro')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Limpiar filtros' }))

    expect(onClearFilters).toHaveBeenCalledTimes(1)
  })

  it('shows its own action and no clear button in the "sin registros" variant', () => {
    render(
      <EmptyState variant="sin-registros" title="Todavía no hay sedes" onClearFilters={vi.fn()}>
        <Button>Registrar sede</Button>
      </EmptyState>,
    )

    expect(screen.getByRole('button', { name: 'Registrar sede' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Limpiar filtros' })).not.toBeInTheDocument()
  })

  it('works without variant as a plain message', () => {
    render(<EmptyState eyebrow="Coming next" title="Pronto" />)

    expect(screen.getByText('Coming next')).toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })
})

describe('EmptyState variants', () => {
  it('draws the icon of the "sin resultados" variant', () => {
    const { container } = render(<EmptyState variant="sin-resultados" title="Sin resultados" />)

    expect(icon(container)).toHaveClass('ui-empty__icon--sin-resultados')
    expect(icon(container)).not.toHaveClass('ui-empty__icon--sin-registros')
    // The magnifier with a minus sign is the only icon that draws a circle.
    expect(icon(container)?.querySelector('circle')).not.toBeNull()
  })

  it('draws the icon of the "sin registros" variant', () => {
    const { container } = render(<EmptyState variant="sin-registros" title="Sin registros" />)

    expect(icon(container)).toHaveClass('ui-empty__icon--sin-registros')
    expect(icon(container)).not.toHaveClass('ui-empty__icon--sin-resultados')
    expect(icon(container)?.querySelector('circle')).toBeNull()
    expect(icon(container)?.querySelector('svg')).not.toBeNull()
  })

  it('draws a different icon for each variant', () => {
    const results = render(<EmptyState variant="sin-resultados" title="A" />)
    const resultsIcon = icon(results.container)?.innerHTML
    results.unmount()
    const records = render(<EmptyState variant="sin-registros" title="B" />)

    expect(resultsIcon).toBeTruthy()
    expect(icon(records.container)?.innerHTML).toBeTruthy()
    expect(icon(records.container)?.innerHTML).not.toBe(resultsIcon)
  })

  it('hides the icon from assistive technology', () => {
    const { container } = render(<EmptyState variant="sin-registros" title="Sin registros" />)

    expect(icon(container)).toHaveAttribute('aria-hidden', 'true')
  })

  it('draws no icon without a variant', () => {
    const { container } = render(<EmptyState title="Pronto" />)

    expect(icon(container)).toBeNull()
  })
})

describe('EmptyState content', () => {
  it('shows the title, the description and the eyebrow', () => {
    render(<EmptyState eyebrow="Próximamente" title="Sin datos" description="Vuelve más tarde" />)

    expect(screen.getByText('Próximamente')).toBeInTheDocument()
    expect(screen.getByText('Sin datos')).toBeInTheDocument()
    expect(screen.getByText('Vuelve más tarde')).toBeInTheDocument()
  })

  it('puts the eyebrow before the title and the title before the description', () => {
    render(<EmptyState eyebrow="Próximamente" title="Sin datos" description="Vuelve más tarde" />)

    const eyebrow = screen.getByText('Próximamente')
    const title = screen.getByText('Sin datos')
    const description = screen.getByText('Vuelve más tarde')
    expect(eyebrow.compareDocumentPosition(title)).toBe(Node.DOCUMENT_POSITION_FOLLOWING)
    expect(title.compareDocumentPosition(description)).toBe(Node.DOCUMENT_POSITION_FOLLOWING)
  })

  it('shows only the title when nothing else is given', () => {
    const { container } = render(<EmptyState title="Sin datos" />)

    expect(screen.getByText('Sin datos')).toBeInTheDocument()
    expect(container.querySelector('.ui-empty__eyebrow')).toBeNull()
    expect(container.querySelector('.ui-empty__description')).toBeNull()
    expect(container.querySelector('.ui-empty__actions')).toBeNull()
  })
})

describe('EmptyState actions', () => {
  it('does not show the clear button without a callback', () => {
    render(<EmptyState variant="sin-resultados" title="Sin resultados" />)

    expect(screen.queryByRole('button', { name: 'Limpiar filtros' })).not.toBeInTheDocument()
  })

  it('does not show the clear button without the "sin resultados" variant', () => {
    render(<EmptyState title="Sin datos" onClearFilters={vi.fn()} />)

    expect(screen.queryByRole('button', { name: 'Limpiar filtros' })).not.toBeInTheDocument()
  })

  it('does not draw the actions area when there is no action', () => {
    const { container } = render(
      <EmptyState variant="sin-registros" title="Sin registros" onClearFilters={vi.fn()} />,
    )

    expect(container.querySelector('.ui-empty__actions')).toBeNull()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('does not call the callback until the button is pressed', () => {
    const onClearFilters = vi.fn()
    render(
      <EmptyState
        variant="sin-resultados"
        title="Sin resultados"
        onClearFilters={onClearFilters}
      />,
    )

    expect(onClearFilters).not.toHaveBeenCalled()
  })

  it('calls the callback once for every press', async () => {
    const onClearFilters = vi.fn()
    const user = userEvent.setup()
    render(
      <EmptyState
        variant="sin-resultados"
        title="Sin resultados"
        onClearFilters={onClearFilters}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Limpiar filtros' }))
    await user.click(screen.getByRole('button', { name: 'Limpiar filtros' }))

    expect(onClearFilters).toHaveBeenCalledTimes(2)
  })

  it('shows the clear button first and then its own actions', () => {
    const { container } = render(
      <EmptyState variant="sin-resultados" title="Sin resultados" onClearFilters={vi.fn()}>
        <Button>Registrar sede</Button>
      </EmptyState>,
    )

    const actions = container.querySelector<HTMLElement>('.ui-empty__actions')
    expect(actions).not.toBeNull()
    const buttons = within(actions as HTMLElement).getAllByRole('button')
    expect(buttons.map((button) => button.textContent)).toEqual([
      'Limpiar filtros',
      'Registrar sede',
    ])
  })

  it('shows its own actions without a variant', () => {
    render(
      <EmptyState title="Sin datos">
        <Button>Volver</Button>
      </EmptyState>,
    )

    expect(screen.getByRole('button', { name: 'Volver' })).toBeInTheDocument()
  })

  it('uses the outline style for the clear button', () => {
    render(<EmptyState variant="sin-resultados" title="Sin resultados" onClearFilters={vi.fn()} />)

    expect(screen.getByRole('button', { name: 'Limpiar filtros' })).toHaveClass(
      'ui-button--outline',
    )
  })
})
