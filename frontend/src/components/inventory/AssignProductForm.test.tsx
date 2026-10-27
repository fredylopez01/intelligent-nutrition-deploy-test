import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { generalStockService } from '../../services/generalStock.service'
import { ApiError } from '../../services/http'
import { inventoryService } from '../../services/inventory.service'
import { productsService } from '../../services/products.service'
import { buildInventoryDetail } from '../../test-utils/inventory'
import { buildProduct, optionsPage } from '../../test-utils/products'

import { AssignProductForm } from './AssignProductForm'

vi.mock('../../services/inventory.service', () => ({
  inventoryService: { getProductInBranch: vi.fn(), assign: vi.fn() },
}))

vi.mock('../../services/generalStock.service', () => ({
  generalStockService: { getByProduct: vi.fn() },
}))

vi.mock('../../services/products.service', () => ({
  productsService: { list: vi.fn() },
}))

vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({ token: 'test-token' }),
}))

const listProducts = vi.mocked(productsService.list)
const getProductInBranch = vi.mocked(inventoryService.getProductInBranch)
const assign = vi.mocked(inventoryService.assign)
const getGeneralStock = vi.mocked(generalStockService.getByProduct)

function stockOf(lots: Array<[string, number]>) {
  return {
    product: {
      id: 'product-whey',
      name: 'Whey Protein 2 lb',
      referenceCode: 'WHEY-2LB-001',
      active: true,
      unitOfMeasure: { abbreviation: 'und' },
    },
    totalQuantity: lots.reduce((sum, [, quantity]) => sum + quantity, 0),
    lots: lots.map(([expirationDate, quantity]) => ({
      id: `lot-${expirationDate}`,
      expirationDate,
      quantity,
      expired: false,
    })),
  }
}

const whey = buildProduct()
const creatine = buildProduct({
  id: 'product-creatine',
  name: 'Creatina 300 g',
  referenceCode: 'CREA-300G',
})

const notAssigned = new ApiError('Not assigned', 404, undefined, 'PRODUCT_NOT_ASSIGNED')

function renderForm() {
  const onAssigned = vi.fn()
  const onCancel = vi.fn()
  const user = userEvent.setup()
  render(
    <AssignProductForm
      branchId="branch-centro"
      branchName="Centro"
      onAssigned={onAssigned}
      onCancel={onCancel}
    />,
  )
  return { user, onAssigned, onCancel }
}

async function chooseProduct(user: ReturnType<typeof userEvent.setup>, name: string) {
  const results = await screen.findByRole('list', { name: 'Productos activos' })
  await user.click(within(results).getByRole('button', { name: new RegExp(name) }))
}

async function fillLot(
  user: ReturnType<typeof userEvent.setup>,
  { quantity = '20', date = '2027-12-31' }: { quantity?: string; date?: string } = {},
) {
  await user.type(screen.getByLabelText('Cantidad inicial'), quantity)
  const lot = screen.getByLabelText('Lote del stock general')
  await waitFor(() => expect(lot).toBeEnabled())
  await user.selectOptions(lot, date)
}

function submit(user: ReturnType<typeof userEvent.setup>) {
  return user.click(screen.getByRole('button', { name: 'Asignar a la sede' }))
}

beforeEach(() => {
  vi.resetAllMocks()
  listProducts.mockResolvedValue(optionsPage([whey, creatine]))
  getProductInBranch.mockRejectedValue(notAssigned)
  getGeneralStock.mockResolvedValue(
    stockOf([
      ['2026-12-31', 100],
      ['2027-03-31', 50],
      ['2027-12-31', 100],
    ]),
  )
  assign.mockResolvedValue({
    id: 'lot-9',
    branchId: 'branch-centro',
    product: {
      id: whey.id,
      name: whey.name,
      referenceCode: whey.referenceCode,
      category: whey.category,
      unitOfMeasure: { abbreviation: 'und' },
      price: whey.price,
      active: true,
    },
    quantity: 20,
    minimumStock: 5,
    lowStock: false,
    expirationDate: '2027-12-31T00:00:00Z',
    updatedAt: '2026-10-16T00:00:00Z',
  })
})

describe('AssignProductForm', () => {
  it('only offers active products and searches them with the magnifier', async () => {
    const { user } = renderForm()

    await screen.findByRole('list', { name: 'Productos activos' })
    expect(listProducts).toHaveBeenCalledWith(
      { page: 1, limit: 8, search: undefined, active: true },
      'test-token',
    )

    await user.type(
      screen.getByLabelText('Buscar producto activo por nombre o código'),
      'crea{Enter}',
    )

    await waitFor(() =>
      expect(listProducts).toHaveBeenLastCalledWith(
        { page: 1, limit: 8, search: 'crea', active: true },
        'test-token',
      ),
    )
  })

  it('says when no active product matches the search', async () => {
    listProducts.mockResolvedValue(optionsPage([]))
    const { user } = renderForm()

    await user.type(
      screen.getByLabelText('Buscar producto activo por nombre o código'),
      'zzz{Enter}',
    )

    expect(
      await screen.findByText('Ningún producto activo coincide con "zzz".'),
    ).toBeInTheDocument()
  })

  it('asks for the product, the quantity and the expiration date', async () => {
    const { user } = renderForm()
    await screen.findByRole('list', { name: 'Productos activos' })

    await submit(user)

    expect(screen.getByText('Elige el producto que vas a asignar.')).toBeInTheDocument()
    expect(screen.getByText('Escribe la cantidad inicial del lote.')).toBeInTheDocument()
    expect(screen.getByText('Elige el lote del stock general.')).toBeInTheDocument()
    expect(assign).not.toHaveBeenCalled()
  })

  it('assigns a new product with its minimum stock and the expiration date in ISO format', async () => {
    const { user, onAssigned } = renderForm()

    await chooseProduct(user, 'Whey Protein 2 lb')
    await waitFor(() =>
      expect(getProductInBranch).toHaveBeenCalledWith(
        'branch-centro',
        'product-whey',
        'test-token',
      ),
    )
    await fillLot(user)
    await user.clear(screen.getByLabelText('Stock mínimo'))
    await user.type(screen.getByLabelText('Stock mínimo'), '5')
    await submit(user)

    await waitFor(() =>
      expect(assign).toHaveBeenCalledWith(
        'branch-centro',
        {
          productId: 'product-whey',
          quantity: 20,
          minimumStock: 5,
          expirationDate: '2027-12-31T00:00:00Z',
        },
        'test-token',
      ),
    )
    expect(onAssigned).toHaveBeenCalledWith(expect.objectContaining({ id: 'lot-9' }))
  })

  it('accepts a lot with zero units', async () => {
    const { user } = renderForm()

    await chooseProduct(user, 'Whey Protein 2 lb')
    await fillLot(user, { quantity: '0' })
    await submit(user)

    await waitFor(() =>
      expect(assign).toHaveBeenCalledWith(
        'branch-centro',
        expect.objectContaining({ quantity: 0, minimumStock: 0 }),
        'test-token',
      ),
    )
  })

  it('inherits the minimum stock when the product is already in the branch', async () => {
    getProductInBranch.mockResolvedValue(buildInventoryDetail())
    const { user } = renderForm()

    await chooseProduct(user, 'Whey Protein 2 lb')

    expect(await screen.findByText(/ya está en Centro con 35 und en 2 lotes/)).toBeInTheDocument()
    expect(screen.getByLabelText('Stock mínimo')).toHaveValue('8')
    expect(screen.getByLabelText('Stock mínimo')).toHaveAttribute('readonly')

    await fillLot(user, { quantity: '5', date: '2027-03-31' })
    await submit(user)

    await waitFor(() => expect(assign).toHaveBeenCalled())
    expect(assign.mock.calls[0][1]).toEqual({
      productId: 'product-whey',
      quantity: 5,
      expirationDate: '2027-03-31T00:00:00Z',
    })
  })

  it('blocks a lot with an expiration date that the product already has in the branch', async () => {
    getProductInBranch.mockResolvedValue(buildInventoryDetail())
    const { user } = renderForm()

    await chooseProduct(user, 'Whey Protein 2 lb')
    await screen.findByText(/ya está en Centro/)
    await fillLot(user, { date: '2026-12-31' })
    await submit(user)

    expect(
      await screen.findByText(/ya tiene un lote con esa fecha de vencimiento en la sede/),
    ).toBeInTheDocument()
    expect(assign).not.toHaveBeenCalled()
  })

  it('rejects decimals', async () => {
    const { user } = renderForm()

    await chooseProduct(user, 'Whey Protein 2 lb')
    await fillLot(user, { quantity: '2.5' })
    await submit(user)

    expect(
      screen.getByText(
        'La cantidad debe ser un número entero de 0 en adelante, sin puntos ni comas.',
      ),
    ).toBeInTheDocument()
    expect(assign).not.toHaveBeenCalled()
  })

  it('offers the general stock lots and proposes the one that expires first', async () => {
    const { user } = renderForm()

    await chooseProduct(user, 'Whey Protein 2 lb')

    const lot = screen.getByLabelText('Lote del stock general')
    await waitFor(() => expect(lot).toHaveValue('2026-12-31'))
    expect(getGeneralStock).toHaveBeenCalledWith('product-whey', 'test-token')
    expect(
      within(lot)
        .getAllByRole('option')
        .slice(1)
        .map((option) => option.textContent),
    ).toEqual([
      'Vence 31 dic 2026 · 100 und disponibles',
      'Vence 31 mar 2027 · 50 und disponibles',
      'Vence 31 dic 2027 · 100 und disponibles',
    ])
  })

  it('does not ask for more units than the chosen lot has in the general stock', async () => {
    const { user } = renderForm()

    await chooseProduct(user, 'Whey Protein 2 lb')
    await fillLot(user, { quantity: '51', date: '2027-03-31' })
    await submit(user)

    expect(
      await screen.findByText('Solo hay 50 und de este lote en el stock general.'),
    ).toBeInTheDocument()
    expect(assign).not.toHaveBeenCalled()
  })

  it('explains that the product needs general stock before it can be assigned', async () => {
    getGeneralStock.mockResolvedValue(stockOf([]))
    const { user } = renderForm()

    await chooseProduct(user, 'Whey Protein 2 lb')

    expect(
      await screen.findByText(/no tiene unidades vigentes en el stock general/),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Asignar a la sede' })).toBeDisabled()
  })

  it('shows on the quantity that the general stock no longer has those units', async () => {
    assign.mockRejectedValue(
      new ApiError('Insufficient', 422, undefined, 'INSUFFICIENT_GENERAL_STOCK'),
    )
    const { user } = renderForm()

    await chooseProduct(user, 'Whey Protein 2 lb')
    await fillLot(user)
    await submit(user)

    expect(
      await screen.findByText(/El stock general ya no tiene esa cantidad de este lote/),
    ).toBeInTheDocument()
    expect(screen.getByLabelText('Cantidad inicial')).toHaveFocus()
  })

  it('shows the duplicated lot from the backend on the expiration date', async () => {
    assign.mockRejectedValue(
      new ApiError('Already assigned', 409, undefined, 'PRODUCT_ALREADY_ASSIGNED'),
    )
    const { user, onAssigned } = renderForm()

    await chooseProduct(user, 'Whey Protein 2 lb')
    await fillLot(user)
    await submit(user)

    expect(
      await screen.findByText(/ya tiene un lote con esa fecha de vencimiento en la sede/),
    ).toBeInTheDocument()
    expect(screen.getByLabelText('Lote del stock general')).toHaveFocus()
    expect(onAssigned).not.toHaveBeenCalled()
  })

  it('asks for another product when the chosen one became inactive', async () => {
    assign.mockRejectedValue(new ApiError('Inactive', 422, undefined, 'PRODUCT_INACTIVE'))
    const { user } = renderForm()

    await chooseProduct(user, 'Whey Protein 2 lb')
    await fillLot(user)
    await submit(user)

    expect(
      await screen.findByText(
        'El producto está inactivo y no se puede asignar. Elige otro producto.',
      ),
    ).toBeInTheDocument()
  })

  it('explains that an inactive branch cannot receive products', async () => {
    assign.mockRejectedValue(new ApiError('Inactive', 422, undefined, 'BRANCH_INACTIVE'))
    const { user } = renderForm()

    await chooseProduct(user, 'Whey Protein 2 lb')
    await fillLot(user)
    await submit(user)

    expect(await screen.findByRole('alert')).toHaveTextContent('La sede está inactiva')
  })

  it('lets the user change the chosen product', async () => {
    const { user } = renderForm()

    await chooseProduct(user, 'Whey Protein 2 lb')
    await user.click(screen.getByRole('button', { name: 'Cambiar' }))
    await chooseProduct(user, 'Creatina 300 g')

    await waitFor(() =>
      expect(getProductInBranch).toHaveBeenLastCalledWith(
        'branch-centro',
        'product-creatine',
        'test-token',
      ),
    )
    expect(screen.getByText('Creatina 300 g')).toBeInTheDocument()
  })

  it('cancels without assigning', async () => {
    const { user, onCancel } = renderForm()

    await user.click(screen.getByRole('button', { name: 'Cancelar' }))

    expect(onCancel).toHaveBeenCalled()
    expect(assign).not.toHaveBeenCalled()
  })

  it('says there are no active products when the catalogue is empty', async () => {
    listProducts.mockResolvedValue(optionsPage([]))
    renderForm()

    expect(await screen.findByText('No hay productos activos en el catálogo.')).toBeInTheDocument()
  })

  it('shows an error when the product search fails', async () => {
    listProducts.mockRejectedValue(new Error('Network error'))
    renderForm()

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No fue posible buscar productos. Intenta de nuevo.',
    )
  })

  it('shows an error when checking the branch inventory fails', async () => {
    getProductInBranch.mockRejectedValue(new ApiError('Server error', 500))
    const { user } = renderForm()

    await chooseProduct(user, 'Whey Protein 2 lb')

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No fue posible revisar si el producto ya está en la sede.',
    )
  })

  it('shows a generic error when the assignment fails unexpectedly', async () => {
    assign.mockRejectedValue(new ApiError('Server error', 500))
    const { user } = renderForm()

    await chooseProduct(user, 'Whey Protein 2 lb')
    await fillLot(user)
    await submit(user)

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No fue posible asignar el producto. Intenta de nuevo.',
    )
  })
})
