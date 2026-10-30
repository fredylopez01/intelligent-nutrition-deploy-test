import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { generalStockService } from '../../services/generalStock.service'
import { ApiError } from '../../services/http'
import { productsService } from '../../services/products.service'
import { buildInventoryItem } from '../../test-utils/inventory'
import type { GeneralStockDetail } from '../../types/inventory'
import type { Product } from '../../types/product'

import { RestockForm } from './RestockForm'

vi.mock('../../services/generalStock.service', () => ({
  generalStockService: { getByProduct: vi.fn(), restock: vi.fn() },
}))

vi.mock('../../services/products.service', () => ({
  productsService: { list: vi.fn() },
}))

vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({ token: 'test-token' }),
}))

const getByProduct = vi.mocked(generalStockService.getByProduct)
const restock = vi.mocked(generalStockService.restock)

const whey = { ...buildInventoryItem().product, description: null } as Product

function stock(totalQuantity: number): GeneralStockDetail {
  return {
    product: {
      id: whey.id,
      name: whey.name,
      referenceCode: whey.referenceCode,
      active: true,
      unitOfMeasure: { abbreviation: 'und' },
    },
    totalQuantity,
    lots: [{ id: 'gs-1', expirationDate: '2027-06-30', quantity: totalQuantity, expired: false }],
  }
}

function renderForm() {
  const onRestocked = vi.fn()
  const onCancel = vi.fn()
  const user = userEvent.setup()
  render(<RestockForm onRestocked={onRestocked} onCancel={onCancel} />)
  return { user, onRestocked, onCancel }
}

async function pickWhey(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole('button', { name: /Whey Protein 2 lb/ }))
  expect(await screen.findByText('Stock general actual')).toBeInTheDocument()
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(productsService.list).mockResolvedValue({
    data: [whey],
    meta: { page: 1, limit: 6, total: 1, totalPages: 1 },
  })
  getByProduct.mockResolvedValue(stock(12))
  restock.mockResolvedValue(stock(20))
})

describe('RestockForm', () => {
  it('shows the current and projected general stock and adds the units', async () => {
    const { user, onRestocked } = renderForm()
    await pickWhey(user)

    await user.type(screen.getByLabelText('Cantidad a agregar'), '8')
    await user.type(screen.getByLabelText('Razón del ajuste'), 'Conteo físico del almacén')

    expect(screen.getByText('12 und')).toBeInTheDocument()
    expect(screen.getByText('20 und')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Confirmar ajuste' }))

    await waitFor(() =>
      expect(restock).toHaveBeenCalledWith(
        whey.id,
        { quantity: 8, movementType: 'ADJUSTMENT_ENTRY', reason: 'Conteo físico del almacén' },
        'test-token',
      ),
    )
    expect(onRestocked).toHaveBeenCalledWith(stock(20), expect.objectContaining({ quantity: '8' }))
  })

  it('does not let an exit leave the general stock negative', async () => {
    const { user } = renderForm()
    await pickWhey(user)

    await user.click(screen.getByLabelText(/Retirar unidades/))
    await user.type(screen.getByLabelText('Cantidad a retirar'), '15')
    await user.type(screen.getByLabelText('Razón del ajuste'), 'Producto dañado en bodega')
    await user.click(screen.getByRole('button', { name: 'Confirmar ajuste' }))

    expect(
      await screen.findByText(/solo tiene 12 und: no puede quedar negativo/),
    ).toBeInTheDocument()
    expect(restock).not.toHaveBeenCalled()
  })

  it('asks for the product, a valid quantity and a reason', async () => {
    const { user } = renderForm()
    await screen.findByRole('button', { name: /Whey Protein 2 lb/ })

    await user.click(screen.getByRole('button', { name: 'Confirmar ajuste' }))

    expect(await screen.findByText('Elige el producto que vas a ajustar.')).toBeInTheDocument()
    expect(screen.getByText('Escribe la cantidad.')).toBeInTheDocument()
    expect(screen.getByText(/al menos 10 caracteres/)).toBeInTheDocument()
  })

  it('shows the api error', async () => {
    restock.mockRejectedValue(new ApiError('Inactive', 422, {}, 'PRODUCT_INACTIVE'))
    const { user } = renderForm()
    await pickWhey(user)

    await user.type(screen.getByLabelText('Cantidad a agregar'), '2')
    await user.type(screen.getByLabelText('Razón del ajuste'), 'Conteo físico del almacén')
    await user.click(screen.getByRole('button', { name: 'Confirmar ajuste' }))

    expect(
      await screen.findByText('El producto está inactivo: su stock general no se puede ajustar.'),
    ).toBeInTheDocument()
  })

  it('searches the product and shows the chosen one with its reference and category', async () => {
    const { user } = renderForm()

    expect(screen.getByText('Buscando productos...')).toBeInTheDocument()
    await user.click(await screen.findByRole('button', { name: /Whey Protein 2 lb/ }))

    expect(await screen.findByText('WHEY-2LB-001 · Proteínas')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cambiar' })).toBeInTheDocument()
    expect(screen.queryByRole('searchbox')).not.toBeInTheDocument()
  })

  it('explains when no active product matches the search', async () => {
    vi.mocked(productsService.list).mockResolvedValue({
      data: [],
      meta: { page: 1, limit: 6, total: 0, totalPages: 0 },
    })
    const { user } = renderForm()

    expect(await screen.findByText('No hay productos activos.')).toBeInTheDocument()
    await user.type(screen.getByRole('searchbox', { name: /Buscar producto/ }), 'zzz')
    await user.click(screen.getByRole('button', { name: 'Buscar' }))

    expect(
      await screen.findByText('Ningún producto activo coincide con "zzz".'),
    ).toBeInTheDocument()
  })

  it('explains when the product search fails', async () => {
    vi.mocked(productsService.list).mockRejectedValue(new Error('boom'))
    renderForm()

    expect(
      await screen.findByText('No fue posible buscar productos. Intenta de nuevo.'),
    ).toBeInTheDocument()
  })

  it('returns to the search when the product is changed', async () => {
    const { user } = renderForm()
    await pickWhey(user)

    await user.click(screen.getByRole('button', { name: 'Cambiar' }))

    expect(screen.getByRole('searchbox', { name: /Buscar producto/ })).toBeInTheDocument()
    expect(screen.queryByText('Stock general actual')).not.toBeInTheDocument()
  })

  it('explains when the general stock cannot be loaded', async () => {
    getByProduct.mockRejectedValue(new Error('boom'))
    const { user } = renderForm()

    await user.click(await screen.findByRole('button', { name: /Whey Protein 2 lb/ }))

    expect(
      await screen.findByText('No fue posible consultar el stock general.'),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Confirmar ajuste' })).toBeDisabled()
  })

  it('rejects a quantity that is not a whole number', async () => {
    const { user } = renderForm()
    await pickWhey(user)

    await user.type(screen.getByLabelText('Cantidad a agregar'), '1.5')
    expect(screen.getByText('—')).toBeInTheDocument()
    await user.type(screen.getByLabelText('Razón del ajuste'), 'Conteo físico del almacén')
    await user.click(screen.getByRole('button', { name: 'Confirmar ajuste' }))

    expect(
      await screen.findByText(
        'La cantidad debe ser un número entero mayor que 0, sin puntos ni comas.',
      ),
    ).toBeInTheDocument()
    expect(restock).not.toHaveBeenCalled()
  })

  it('removes units from the general stock', async () => {
    restock.mockResolvedValue(stock(7))
    const { user, onRestocked } = renderForm()
    await pickWhey(user)

    await user.click(screen.getByLabelText(/Retirar unidades/))
    await user.type(screen.getByLabelText('Cantidad a retirar'), '5')
    expect(screen.getByText('7 und')).toBeInTheDocument()
    await user.type(screen.getByLabelText('Razón del ajuste'), 'Producto dañado en bodega')
    await user.click(screen.getByRole('button', { name: 'Confirmar ajuste' }))

    await waitFor(() =>
      expect(restock).toHaveBeenCalledWith(
        whey.id,
        { quantity: 5, movementType: 'ADJUSTMENT_EXIT', reason: 'Producto dañado en bodega' },
        'test-token',
      ),
    )
    expect(onRestocked).toHaveBeenCalledWith(stock(7), expect.objectContaining({ quantity: '5' }))
  })

  it('shows the progress while the adjustment is sent', async () => {
    let resolve: (value: GeneralStockDetail) => void = () => {}
    restock.mockReturnValue(new Promise((done) => (resolve = done)))
    const { user, onRestocked } = renderForm()
    await pickWhey(user)

    await user.type(screen.getByLabelText('Cantidad a agregar'), '8')
    await user.type(screen.getByLabelText('Razón del ajuste'), 'Conteo físico del almacén')
    await user.click(screen.getByRole('button', { name: 'Confirmar ajuste' }))

    expect(screen.getByRole('button', { name: 'Ajustando...' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Cancelar' })).toBeDisabled()

    resolve(stock(20))

    await waitFor(() =>
      expect(onRestocked).toHaveBeenCalledWith(
        stock(20),
        expect.objectContaining({ quantity: '8' }),
      ),
    )
  })

  it('cancels the adjustment', async () => {
    const { user, onCancel } = renderForm()
    await pickWhey(user)

    await user.click(screen.getByRole('button', { name: 'Cancelar' }))

    expect(onCancel).toHaveBeenCalled()
    expect(restock).not.toHaveBeenCalled()
  })
})
