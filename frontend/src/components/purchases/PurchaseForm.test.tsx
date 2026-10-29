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

const list = vi.mocked(productsService.list)
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
  const onCancel = vi.fn()
  const user = userEvent.setup()
  render(<PurchaseForm suppliers={suppliers} onCreated={onCreated} onCancel={onCancel} />)
  return { user, onCreated, onCancel }
}

beforeEach(() => {
  vi.resetAllMocks()
  list.mockResolvedValue({
    data: [product('whey', 'Whey Protein 2 lb'), product('crea', 'Creatina 300 g')],
    meta: { page: 1, limit: 6, total: 2, totalPages: 1 },
  })
  create.mockResolvedValue(buildPurchase())
})

describe('PurchaseForm', () => {
  it('renders the order form with the empty state', () => {
    renderForm()

    expect(screen.getByRole('heading', { name: 'Productos de la orden' })).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Proveedor' })).toBeInTheDocument()
    expect(
      screen.getByRole('searchbox', { name: 'Buscar producto activo por nombre o código' }),
    ).toBeInTheDocument()
    expect(screen.getByText('Busca y agrega los productos que vas a pedir.')).toBeInTheDocument()
    expect(screen.getByText('$ 0')).toBeInTheDocument()
    expect(screen.getByLabelText('Observación (opcional)')).toHaveValue('')
    expect(screen.getByText('0/500')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cancelar' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Registrar orden de compra' })).toBeEnabled()
  })

  it('cancels without registering the order', async () => {
    const { user, onCancel } = renderForm()

    await user.click(screen.getByRole('button', { name: 'Cancelar' }))

    expect(onCancel).toHaveBeenCalled()
    expect(create).not.toHaveBeenCalled()
  })

  it('offers only active suppliers', () => {
    renderForm()

    expect(screen.getByRole('option', { name: 'Nutri Andina' })).toBeInTheDocument()
    expect(screen.queryByRole('option', { name: 'Proveedor Cerrado' })).not.toBeInTheDocument()
  })

  it('searches active products with the typed term', async () => {
    const { user } = renderForm()

    await waitFor(() =>
      expect(list).toHaveBeenCalledWith(
        { page: 1, limit: 6, search: undefined, active: true },
        'test-token',
      ),
    )

    await user.type(
      screen.getByRole('searchbox', { name: 'Buscar producto activo por nombre o código' }),
      'whey',
    )
    await user.click(screen.getByRole('button', { name: 'Buscar' }))

    await waitFor(() =>
      expect(list).toHaveBeenLastCalledWith(
        { page: 1, limit: 6, search: 'whey', active: true },
        'test-token',
      ),
    )
  })

  it('explains when no product matches the search', async () => {
    list.mockResolvedValue({ data: [], meta: { page: 1, limit: 6, total: 0, totalPages: 0 } })
    const { user } = renderForm()

    await user.type(
      screen.getByRole('searchbox', { name: 'Buscar producto activo por nombre o código' }),
      'zzz',
    )
    await user.click(screen.getByRole('button', { name: 'Buscar' }))

    expect(await screen.findByText(/Ningún producto activo coincide con "zzz"/)).toBeInTheDocument()
  })

  it('explains when the product search fails', async () => {
    list.mockRejectedValue(new Error('boom'))
    renderForm()

    expect(
      await screen.findByText('No fue posible buscar productos. Intenta de nuevo.'),
    ).toBeInTheDocument()
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

  it('shows each line subtotal and ignores incomplete lines', async () => {
    const { user } = renderForm()

    await user.click(await screen.findByRole('button', { name: /Whey Protein 2 lb/ }))
    await user.click(screen.getByRole('button', { name: /Creatina 300 g/ }))
    const quantities = screen.getAllByLabelText('Cantidad (und)')
    const prices = screen.getAllByLabelText('Costo unitario')
    await user.type(quantities[0], '20')
    await user.type(prices[0], '98000')

    expect(screen.getByText(/WHEY · subtotal \$ 1\.960\.000/)).toBeInTheDocument()
    expect(screen.getByText(/CREA · subtotal \$ 0/)).toBeInTheDocument()
    expect(screen.getByText(/Total de la orden:/)).toHaveTextContent('$ 1.960.000')
  })

  it('does not add the same product twice', async () => {
    const { user } = renderForm()

    await user.click(await screen.findByRole('button', { name: /Whey Protein 2 lb/ }))

    expect(
      screen.getByRole('button', { name: /Whey Protein 2 lb · ya está en la orden/ }),
    ).toBeDisabled()
  })

  it('re-enables a product that was removed', async () => {
    const { user } = renderForm()

    await user.click(await screen.findByRole('button', { name: /Whey Protein 2 lb/ }))
    await user.click(screen.getByRole('button', { name: 'Quitar Whey Protein 2 lb de la orden' }))

    const again = screen.getByRole('button', { name: /^Whey Protein 2 lb/ })
    expect(again).toBeEnabled()
    await user.click(again)
    expect(
      screen.getAllByRole('button', { name: 'Quitar Whey Protein 2 lb de la orden' }),
    ).toHaveLength(1)
  })

  it('removes a line', async () => {
    const { user } = renderForm()

    await user.click(await screen.findByRole('button', { name: /Whey Protein 2 lb/ }))
    await user.click(screen.getByRole('button', { name: 'Quitar Whey Protein 2 lb de la orden' }))

    expect(screen.getByText('Busca y agrega los productos que vas a pedir.')).toBeInTheDocument()
    expect(screen.getByText('$ 0')).toBeInTheDocument()
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

  it.each(['', '0'])('rejects an empty or zero quantity (%j)', async (quantity) => {
    const { user } = renderForm()

    await user.selectOptions(screen.getByLabelText('Proveedor'), 'supplier-1')
    await user.click(await screen.findByRole('button', { name: /Whey Protein 2 lb/ }))
    await user.type(screen.getByLabelText('Costo unitario'), '98000')
    if (quantity) await user.type(screen.getByLabelText('Cantidad (und)'), quantity)
    await user.click(screen.getByRole('button', { name: 'Registrar orden de compra' }))

    expect(await screen.findByText('Cantidad entera mayor que 0.')).toBeInTheDocument()
    expect(create).not.toHaveBeenCalled()
  })

  it('sends the observation when it is filled', async () => {
    const { user } = renderForm()

    await user.selectOptions(screen.getByLabelText('Proveedor'), 'supplier-1')
    await user.click(await screen.findByRole('button', { name: /Whey Protein 2 lb/ }))
    await user.type(screen.getByLabelText('Cantidad (und)'), '5')
    await user.type(screen.getByLabelText('Costo unitario'), '98000')
    await user.type(screen.getByLabelText('Observación (opcional)'), ' Pedido mensual ')
    await user.click(screen.getByRole('button', { name: 'Registrar orden de compra' }))

    await waitFor(() =>
      expect(create).toHaveBeenCalledWith(
        expect.objectContaining({ observation: 'Pedido mensual' }),
        'test-token',
      ),
    )
  })

  it('shows the progress while the order is registered', async () => {
    create.mockReturnValue(new Promise(() => {}))
    const { user } = renderForm()

    await user.selectOptions(screen.getByLabelText('Proveedor'), 'supplier-1')
    await user.click(await screen.findByRole('button', { name: /Whey Protein 2 lb/ }))
    await user.type(screen.getByLabelText('Cantidad (und)'), '5')
    await user.type(screen.getByLabelText('Costo unitario'), '98000')
    await user.click(screen.getByRole('button', { name: 'Registrar orden de compra' }))

    expect(await screen.findByRole('button', { name: 'Registrando...' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Cancelar' })).toBeDisabled()
  })

  it.each([
    ['SUPPLIER_INACTIVE', 422, 'El proveedor está inactivo. Elige otro proveedor.'],
    ['PRODUCT_INACTIVE', 422, 'Uno de los productos está inactivo. Quítalo de la orden.'],
  ])('explains %s', async (code, status, message) => {
    create.mockRejectedValue(new ApiError('Inactive', status, {}, code))
    const { user, onCreated } = renderForm()

    await user.selectOptions(screen.getByLabelText('Proveedor'), 'supplier-1')
    await user.click(await screen.findByRole('button', { name: /Whey Protein 2 lb/ }))
    await user.type(screen.getByLabelText('Cantidad (und)'), '2')
    await user.type(screen.getByLabelText('Costo unitario'), '98000')
    await user.click(screen.getByRole('button', { name: 'Registrar orden de compra' }))

    expect(await screen.findByText(message)).toBeInTheDocument()
    expect(onCreated).not.toHaveBeenCalled()
  })

  it('explains an unexpected failure', async () => {
    create.mockRejectedValue(new ApiError('Boom', 500, {}, 'INTERNAL'))
    const { user } = renderForm()

    await user.selectOptions(screen.getByLabelText('Proveedor'), 'supplier-1')
    await user.click(await screen.findByRole('button', { name: /Whey Protein 2 lb/ }))
    await user.type(screen.getByLabelText('Cantidad (und)'), '2')
    await user.type(screen.getByLabelText('Costo unitario'), '98000')
    await user.click(screen.getByRole('button', { name: 'Registrar orden de compra' }))

    expect(
      await screen.findByText('No fue posible registrar la compra. Intenta de nuevo.'),
    ).toBeInTheDocument()
  })
})
