import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { Button } from './Button'
import { EmptyState } from './EmptyState'

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
