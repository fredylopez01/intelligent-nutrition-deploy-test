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
const { product: inventoryProduct } = buildInventoryItem()

const threeBranches = {
  product,
  branches: [
    { branchId: 'branch-sur', branchName: 'Sur', quantity: 0 },
    { branchId: 'branch-norte', branchName: 'Norte', quantity: 12 },
    { branchId: 'branch-centro', branchName: 'Centro', quantity: 5 },
  ],
}

function rows() {
  const table = screen.getByRole('table', { name: 'Existencias por sede' })
  return within(table)
    .getAllByRole('row')
    .slice(1)
    .map((row) => row.textContent)
}

beforeEach(() => {
  vi.resetAllMocks()
})

describe('ProductAvailability', () => {
  it('lists the branches with the current one first and those without stock last', async () => {
    availability.mockResolvedValue(threeBranches)
    render(
      <ProductAvailability branchId="branch-centro" product={inventoryProduct} onClose={vi.fn()} />,
    )

    await screen.findByRole('table', { name: 'Existencias por sede' })
    expect(rows()).toEqual(['CentroEsta sede5 und', 'Norte12 und', 'SurSin existencias'])
    expect(screen.getByText('1 sede más tiene existencias de este producto.')).toBeInTheDocument()
    expect(availability).toHaveBeenCalledWith('product-whey', 'test-token')
  })

  it('offers the transfer from the branches the user manages', async () => {
    availability.mockResolvedValue(threeBranches)
    const onRequestTransfer = vi.fn()
    const user = userEvent.setup()
    render(
      <ProductAvailability
        branchId="branch-centro"
        product={inventoryProduct}
        transferOriginIds={['branch-centro', 'branch-norte', 'branch-sur']}
        onRequestTransfer={onRequestTransfer}
        onClose={vi.fn()}
      />,
    )

    await user.click(await screen.findByRole('button', { name: 'Solicitar traslado desde Norte' }))

    expect(onRequestTransfer).toHaveBeenCalledWith({
      branchId: 'branch-norte',
      branchName: 'Norte',
      quantity: 12,
    })
    expect(screen.getAllByRole('button', { name: /Solicitar traslado/ })).toHaveLength(1)
    expect(screen.queryByText(/Los traslados los registra/)).not.toBeInTheDocument()
  })

  it('explains who registers the transfer when the user cannot', async () => {
    availability.mockResolvedValue(threeBranches)
    render(
      <ProductAvailability
        branchId="branch-centro"
        product={inventoryProduct}
        transferOriginIds={['branch-centro']}
        onRequestTransfer={vi.fn()}
        onClose={vi.fn()}
      />,
    )

    expect(await screen.findByText(/Los traslados los registra el superadmin/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Solicitar traslado/ })).not.toBeInTheDocument()
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
        product={inventoryProduct}
        transferOriginIds={['branch-norte']}
        onRequestTransfer={vi.fn()}
        onClose={vi.fn()}
      />,
    )

    expect(
      await screen.findByText('Ninguna otra sede activa tiene existencias de este producto.'),
    ).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Solicitar traslado/ })).not.toBeInTheDocument()
  })

  it('shows the empty state when no active branches are returned', async () => {
    availability.mockResolvedValue({ product, branches: [] })
    render(
      <ProductAvailability branchId="branch-centro" product={inventoryProduct} onClose={vi.fn()} />,
    )

    expect(await screen.findByText(/No hay sedes activas para consultar/)).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })

  it('retries when the query fails', async () => {
    availability
      .mockRejectedValueOnce(new ApiError('Error', 500))
      .mockResolvedValueOnce({ product, branches: [] })
    const user = userEvent.setup()
    render(
      <ProductAvailability branchId="branch-centro" product={inventoryProduct} onClose={vi.fn()} />,
    )

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No fue posible consultar la disponibilidad',
    )
    await user.click(screen.getByRole('button', { name: 'Reintentar' }))

    expect(
      await screen.findByText('Ninguna otra sede activa tiene existencias de este producto.'),
    ).toBeInTheDocument()
  })
})
