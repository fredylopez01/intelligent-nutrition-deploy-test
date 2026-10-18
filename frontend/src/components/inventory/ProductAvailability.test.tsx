import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ApiError } from '../../services/http'
import { inventoryService } from '../../services/inventory.service'
import { buildInventoryItem } from '../../test-utils/inventory'

import { ProductAvailability } from './ProductAvailability'

vi.mock('../../services/inventory.service', () => ({
  inventoryService: { availability: vi.fn() },
}))

vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({ token: 'test-token' }),
}))

const availability = vi.mocked(inventoryService.availability)

const product = { id: 'product-whey', name: 'Whey Protein 2 lb', referenceCode: 'WHEY-2LB-001' }

beforeEach(() => {
  vi.resetAllMocks()
})

describe('ProductAvailability', () => {
  it('lists the branches with the current one first and those without stock last', async () => {
    availability.mockResolvedValue({
      product,
      branches: [
        { branchId: 'branch-sur', branchName: 'Sur', quantity: 0 },
        { branchId: 'branch-norte', branchName: 'Norte', quantity: 12 },
        { branchId: 'branch-centro', branchName: 'Centro', quantity: 5 },
      ],
    })
    render(
      <ProductAvailability
        branchId="branch-centro"
        item={buildInventoryItem()}
        onClose={vi.fn()}
      />,
    )

    const list = await screen.findByRole('list', { name: 'Existencias por sede' })
    expect(
      within(list)
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual(['CentroEsta sede5 und', 'Norte12 und', 'SurSin existencias'])
    expect(screen.getByText('1 sede más tiene existencias de este producto.')).toBeInTheDocument()
    expect(availability).toHaveBeenCalledWith('product-whey', 'test-token')
  })

  it('says when no other branch has the product', async () => {
    availability.mockResolvedValue({
      product,
      branches: [
        { branchId: 'branch-centro', branchName: 'Centro', quantity: 35 },
        { branchId: 'branch-norte', branchName: 'Norte', quantity: 0 },
      ],
    })
    render(
      <ProductAvailability
        branchId="branch-centro"
        item={buildInventoryItem()}
        onClose={vi.fn()}
      />,
    )

    expect(
      await screen.findByText('Ninguna otra sede activa tiene existencias de este producto.'),
    ).toBeInTheDocument()
  })

  it('renders the empty breakdown when no active branches are returned', async () => {
    availability.mockResolvedValue({ product, branches: [] })
    render(
      <ProductAvailability
        branchId="branch-centro"
        item={buildInventoryItem()}
        onClose={vi.fn()}
      />,
    )

    expect(
      await screen.findByText('Ninguna otra sede activa tiene existencias de este producto.'),
    ).toBeInTheDocument()
    expect(
      within(screen.getByRole('list', { name: 'Existencias por sede' })).queryAllByRole('listitem'),
    ).toHaveLength(0)
  })

  it('retries when the query fails', async () => {
    availability
      .mockRejectedValueOnce(new ApiError('Error', 500))
      .mockResolvedValueOnce({ product, branches: [] })
    const user = userEvent.setup()
    render(
      <ProductAvailability
        branchId="branch-centro"
        item={buildInventoryItem()}
        onClose={vi.fn()}
      />,
    )

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No fue posible consultar la disponibilidad',
    )
    expect(screen.queryByRole('list', { name: 'Existencias por sede' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Reintentar' }))

    expect(
      await screen.findByText('Ninguna otra sede activa tiene existencias de este producto.'),
    ).toBeInTheDocument()
  })
})
