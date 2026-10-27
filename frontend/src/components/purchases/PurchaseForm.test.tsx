import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ApiError } from '../../services/http'
import { productsService } from '../../services/products.service'
import { purchasesService } from '../../services/purchases.service'
import { buildPurchase } from '../../test-utils/purchases'
import type { Product } from '../../types/product'

import { PurchaseForm } from './PurchaseForm'

vi.mock('../../services/products.service', () => ({
  productsService: { list: vi.fn() },
}))

vi.mock('../../services/purchases.service', () => ({
  purchasesService: { create: vi.fn() },
}))

vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({ token: 'test-token' }),
}))

const create = vi.mocked(purchasesService.create)

const product = (id: string, name: string): Product => ({
  id,
  name,
  referenceCode: id.toUpperCase(),
  description: null,
  category: { id: 'cat', name: 'Proteínas' },
  unitOfMeasure: { id: 'und', name: 'Unidad', abbreviation: 'und' },
  price: '145000.00',
  active: true,
})

const suppliers = [
  { id: 'supplier-1', name: 'Nutri Andina', active: true },
  { id: 'supplier-2', name: 'Proveedor Cerrado', active: false },
]

function renderForm() {
  const onCreated = vi.fn()
  const user = userEvent.setup()
  render(<PurchaseForm suppliers={suppliers} onCreated={onCreated} onCancel={vi.fn()} />)
  return { user, onCreated }
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(productsService.list).mockResolvedValue({
    data: [product('whey', 'Whey Protein 2 lb'), product('crea', 'Creatina 300 g')],
    meta: { page: 1, limit: 6, total: 2, totalPages: 1 },
  })
  create.mockResolvedValue(buildPurchase())
})

describe('PurchaseForm', () => {
  it('offers only active suppliers', () => {
    renderForm()

    expect(screen.getByRole('option', { name: 'Nutri Andina' })).toBeInTheDocument()
    expect(screen.queryByRole('option', { name: 'Proveedor Cerrado' })).not.toBeInTheDocument()
  })

  it('builds the order with quantities and costs and shows the total', async () => {
    const { user, onCreated } = renderForm()

    await user.selectOptions(screen.getByLabelText('Proveedor'), 'supplier-1')
    await user.click(await screen.findByRole('button', { name: /Whey Protein 2 lb/ }))
    await user.click(screen.getByRole('button', { name: /Creatina 300 g/ }))
    const quantities = screen.getAllByLabelText('Cantidad (und)')
    const prices = screen.getAllByLabelText('Costo unitario')
    await user.type(quantities[0], '20')
    await user.type(prices[0], '98000')
    await user.type(quantities[1], '10')
    await user.type(prices[1], '75500,50')

    expect(screen.getByText('$ 2.715.005')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Registrar orden de compra' }))

    await waitFor(() =>
      expect(create).toHaveBeenCalledWith(
        {
          supplierId: 'supplier-1',
          items: [
            { productId: 'whey', requestedQuantity: 20, unitPrice: '98000.00' },
            { productId: 'crea', requestedQuantity: 10, unitPrice: '75500.50' },
          ],
        },
        'test-token',
      ),
    )
    expect(onCreated).toHaveBeenCalled()
  })

  it('does not add the same product twice', async () => {
    const { user } = renderForm()

    await user.click(await screen.findByRole('button', { name: /Whey Protein 2 lb/ }))

    expect(
      screen.getByRole('button', { name: /Whey Protein 2 lb · ya está en la orden/ }),
    ).toBeDisabled()
  })

  it('asks for the supplier, a product and valid lines', async () => {
    const { user } = renderForm()

    await user.click(screen.getByRole('button', { name: 'Registrar orden de compra' }))

    expect(await screen.findByText('Elige el proveedor.')).toBeInTheDocument()
    expect(screen.getByText('Agrega al menos un producto a la orden.')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /Whey Protein 2 lb/ }))
    await user.type(screen.getByLabelText('Cantidad (und)'), '1.5')
    await user.type(screen.getByLabelText('Costo unitario'), '98.000')
    await user.click(screen.getByRole('button', { name: 'Registrar orden de compra' }))

    expect(await screen.findByText('Cantidad entera mayor que 0.')).toBeInTheDocument()
    expect(
      screen.getByText('Costo con máximo 2 decimales, sin puntos de miles.'),
    ).toBeInTheDocument()
    expect(create).not.toHaveBeenCalled()
  })

  it('removes a line', async () => {
    const { user } = renderForm()

    await user.click(await screen.findByRole('button', { name: /Whey Protein 2 lb/ }))
    await user.click(screen.getByRole('button', { name: 'Quitar Whey Protein 2 lb de la orden' }))

    expect(screen.getByText('Busca y agrega los productos que vas a pedir.')).toBeInTheDocument()
  })

  it('explains an inactive supplier', async () => {
    create.mockRejectedValue(new ApiError('Inactive', 422, {}, 'SUPPLIER_INACTIVE'))
    const { user } = renderForm()

    await user.selectOptions(screen.getByLabelText('Proveedor'), 'supplier-1')
    await user.click(await screen.findByRole('button', { name: /Whey Protein 2 lb/ }))
    await user.type(screen.getByLabelText('Cantidad (und)'), '2')
    await user.type(screen.getByLabelText('Costo unitario'), '98000')
    await user.click(screen.getByRole('button', { name: 'Registrar orden de compra' }))

    expect(
      await screen.findByText('El proveedor está inactivo. Elige otro proveedor.'),
    ).toBeInTheDocument()
  })
})
