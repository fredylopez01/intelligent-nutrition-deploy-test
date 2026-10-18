import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ApiError } from '../../services/http'
import { inventoryService } from '../../services/inventory.service'
import { buildInventoryItem } from '../../test-utils/inventory'

import { MinimumStockForm } from './MinimumStockForm'

vi.mock('../../services/inventory.service', () => ({
  inventoryService: { updateMinimumStock: vi.fn() },
}))

vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({ token: 'test-token' }),
}))

const updateMinimumStock = vi.mocked(inventoryService.updateMinimumStock)

const result = {
  branchId: 'branch-centro',
  productId: 'product-whey',
  minimumStock: 40,
  totalQuantity: 35,
  lowStock: true,
  lotsUpdated: 2,
  lots: [],
  updatedAt: '2026-10-16T00:00:00Z',
}

function renderForm() {
  const onSaved = vi.fn()
  const onCancel = vi.fn()
  const user = userEvent.setup()
  render(
    <MinimumStockForm
      branchId="branch-centro"
      item={buildInventoryItem()}
      onSaved={onSaved}
      onCancel={onCancel}
    />,
  )
  return { user, onSaved, onCancel }
}

async function typeMinimum(user: ReturnType<typeof userEvent.setup>, value: string) {
  const field = screen.getByLabelText('Nuevo stock mínimo')
  await user.clear(field)
  if (value) await user.type(field, value)
}

beforeEach(() => {
  vi.resetAllMocks()
  updateMinimumStock.mockResolvedValue(result)
})

describe('MinimumStockForm', () => {
  it('starts with the current minimum and the stock of the branch', () => {
    renderForm()

    expect(screen.getByLabelText('Nuevo stock mínimo')).toHaveValue('8')
    expect(screen.getByText('35 und')).toBeInTheDocument()
    expect(screen.getByText('8 und')).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('el producto queda en nivel')
  })

  it('warns before saving when the new minimum leaves the product under it', async () => {
    const { user } = renderForm()

    await typeMinimum(user, '40')

    expect(screen.getByRole('status')).toHaveTextContent(
      'Con este mínimo el producto quedará bajo mínimo: hay 35 und y el mínimo sería 40 und.',
    )
  })

  it('saves the new minimum and returns the updated values', async () => {
    const { user, onSaved } = renderForm()

    await typeMinimum(user, '40')
    await user.click(screen.getByRole('button', { name: 'Guardar stock mínimo' }))

    await waitFor(() =>
      expect(updateMinimumStock).toHaveBeenCalledWith(
        'branch-centro',
        'product-whey',
        40,
        'test-token',
      ),
    )
    expect(onSaved).toHaveBeenCalledWith(result)
  })

  it('does not call the backend when the value did not change', async () => {
    const { user, onSaved } = renderForm()

    await user.click(screen.getByRole('button', { name: 'Guardar stock mínimo' }))

    expect(screen.getByText('No hay cambios por guardar.')).toBeInTheDocument()
    expect(updateMinimumStock).not.toHaveBeenCalled()
    expect(onSaved).not.toHaveBeenCalled()
  })

  it('only accepts whole numbers from zero', async () => {
    const { user } = renderForm()

    await typeMinimum(user, '-3')
    await user.click(screen.getByRole('button', { name: 'Guardar stock mínimo' }))
    expect(
      screen.getByText(
        'El stock mínimo debe ser un número entero de 0 en adelante, sin puntos ni comas.',
      ),
    ).toBeInTheDocument()

    await typeMinimum(user, '')
    await user.click(screen.getByRole('button', { name: 'Guardar stock mínimo' }))
    expect(screen.getByText('Escribe el stock mínimo (puede ser 0).')).toBeInTheDocument()
    expect(updateMinimumStock).not.toHaveBeenCalled()
  })

  it('rejects decimal and overlong values without saving', async () => {
    const { user, onSaved } = renderForm()

    await typeMinimum(user, '2.5')
    await user.click(screen.getByRole('button', { name: 'Guardar stock mínimo' }))
    expect(
      screen.getByText(
        'El stock mínimo debe ser un número entero de 0 en adelante, sin puntos ni comas.',
      ),
    ).toBeInTheDocument()

    await typeMinimum(user, '1234567890')
    await user.click(screen.getByRole('button', { name: 'Guardar stock mínimo' }))
    expect(
      screen.getByText(
        'El stock mínimo debe ser un número entero de 0 en adelante, sin puntos ni comas.',
      ),
    ).toBeInTheDocument()
    expect(updateMinimumStock).not.toHaveBeenCalled()
    expect(onSaved).not.toHaveBeenCalled()
  })

  it('explains why the backend rejected the change', async () => {
    updateMinimumStock.mockRejectedValue(
      new ApiError('Inactive', 422, undefined, 'BRANCH_INACTIVE'),
    )
    const { user, onSaved } = renderForm()

    await typeMinimum(user, '10')
    await user.click(screen.getByRole('button', { name: 'Guardar stock mínimo' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('La sede está inactiva')
    expect(onSaved).not.toHaveBeenCalled()
  })
})
