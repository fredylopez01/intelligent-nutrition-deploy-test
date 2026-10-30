import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { inventoryService } from '../../services/inventory.service'
import { productsService } from '../../services/products.service'
import { buildInventoryItem } from '../../test-utils/inventory'
import type { Product } from '../../types/product'

import { AvailabilityLookup } from './AvailabilityLookup'

vi.mock('../../services/inventory.service', () => ({
  inventoryService: { availability: vi.fn() },
}))

vi.mock('../../services/products.service', () => ({
  productsService: { list: vi.fn() },
}))

vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({ token: 'test-token' }),
}))

const list = vi.mocked(productsService.list)
const availability = vi.mocked(inventoryService.availability)

const whey = {
  ...buildInventoryItem().product,
  description: null,
} as Product

function page(data: Product[]) {
  return { data, meta: { page: 1, limit: 6, total: data.length, totalPages: data.length ? 1 : 0 } }
}

beforeEach(() => {
  vi.resetAllMocks()
  list.mockResolvedValue(page([whey]))
  availability.mockResolvedValue({
    product: { id: whey.id, name: whey.name, referenceCode: whey.referenceCode },
    branches: [
      { branchId: 'branch-centro', branchName: 'Centro', quantity: 0 },
      { branchId: 'branch-norte', branchName: 'Norte', quantity: 12 },
    ],
  })
})

describe('AvailabilityLookup', () => {
  it('searches active products and shows the availability of the chosen one', async () => {
    const onRequestTransfer = vi.fn()
    const onClose = vi.fn()
    const user = userEvent.setup()
    render(
      <AvailabilityLookup
        branchId="branch-centro"
        transferOriginIds={['branch-norte']}
        onRequestTransfer={onRequestTransfer}
        onClose={onClose}
      />,
    )

    await user.type(
      screen.getByRole('searchbox', { name: 'Buscar producto por nombre o código' }),
      'whey',
    )
    await user.click(screen.getByRole('button', { name: 'Buscar' }))
    await waitFor(() =>
      expect(list).toHaveBeenLastCalledWith(
        { page: 1, limit: 6, search: 'whey', active: true },
        'test-token',
      ),
    )
    await user.click(await screen.findByRole('button', { name: /Whey Protein 2 lb/ }))

    expect(await screen.findByText('Sin existencias')).toBeInTheDocument()
    expect(screen.getByText(whey.name)).toBeInTheDocument()
    expect(screen.getByText(`${whey.referenceCode} · ${whey.category.name}`)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Solicitar traslado desde Norte' }))
    expect(onRequestTransfer).toHaveBeenCalledWith(expect.objectContaining({ id: whey.id }), {
      branchId: 'branch-norte',
      branchName: 'Norte',
      quantity: 12,
    })

    await user.click(screen.getByRole('button', { name: 'Cerrar' }))
    expect(onClose).toHaveBeenCalled()
  })

  it('lists active products before typing', async () => {
    render(<AvailabilityLookup branchId="branch-centro" onClose={vi.fn()} />)

    expect(await screen.findByRole('list', { name: 'Productos encontrados' })).toBeInTheDocument()
    expect(
      screen.getByText('Escribe el nombre o el código, o elige uno de estos productos.'),
    ).toBeInTheDocument()
    expect(list).toHaveBeenCalledWith(
      { page: 1, limit: 6, search: undefined, active: true },
      'test-token',
    )
  })

  it('shows the loading state while searching', () => {
    list.mockReturnValue(new Promise(() => {}))
    render(<AvailabilityLookup branchId="branch-centro" onClose={vi.fn()} />)

    expect(screen.getByRole('status')).toHaveTextContent('Buscando productos...')
    expect(screen.queryByRole('list', { name: 'Productos encontrados' })).not.toBeInTheDocument()
  })

  it('explains that the catalog has no active products', async () => {
    list.mockResolvedValue(page([]))
    render(<AvailabilityLookup branchId="branch-centro" onClose={vi.fn()} />)

    expect(await screen.findByText('No hay productos activos')).toBeInTheDocument()
    expect(
      screen.getByText(
        'Cuando el catálogo tenga productos activos, podrás consultar sus existencias aquí.',
      ),
    ).toBeInTheDocument()
  })

  it('closes from the search step without choosing a product', async () => {
    const onClose = vi.fn()
    const user = userEvent.setup()
    render(<AvailabilityLookup branchId="branch-centro" onClose={onClose} />)
    await screen.findByRole('list', { name: 'Productos encontrados' })

    await user.click(screen.getByRole('button', { name: 'Cerrar' }))

    expect(onClose).toHaveBeenCalled()
    expect(availability).not.toHaveBeenCalled()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })

  it('goes back to the search to pick another product', async () => {
    const user = userEvent.setup()
    render(<AvailabilityLookup branchId="branch-centro" onClose={vi.fn()} />)

    await user.click(await screen.findByRole('button', { name: /Whey Protein 2 lb/ }))
    await user.click(await screen.findByRole('button', { name: 'Cambiar producto' }))

    expect(await screen.findByRole('list', { name: 'Productos encontrados' })).toBeInTheDocument()
  })

  it('shows the empty state when nothing matches', async () => {
    list.mockResolvedValue(page([]))
    const user = userEvent.setup()
    render(<AvailabilityLookup branchId="branch-centro" onClose={vi.fn()} />)

    await user.type(
      screen.getByRole('searchbox', { name: 'Buscar producto por nombre o código' }),
      'xyz',
    )
    await user.click(screen.getByRole('button', { name: 'Buscar' }))

    expect(await screen.findByText('Ningún producto activo coincide con "xyz"')).toBeInTheDocument()
  })

  it('reports a failed search', async () => {
    list.mockRejectedValue(new Error('down'))
    render(<AvailabilityLookup branchId="branch-centro" onClose={vi.fn()} />)

    expect(
      await screen.findByText('No fue posible buscar productos. Intenta de nuevo.'),
    ).toBeInTheDocument()
  })
})
