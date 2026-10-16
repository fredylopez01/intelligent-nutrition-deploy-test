import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { categoriesService } from '../../services/categories.service'
import { ApiError } from '../../services/http'
import { productsService } from '../../services/products.service'
import { unitsService } from '../../services/units.service'
import { CATEGORIES, UNITS, buildProduct, optionsPage } from '../../test-utils/products'

import { CreateProductForm } from './CreateProductForm'

vi.mock('../../services/products.service', () => ({
  productsService: { create: vi.fn() },
}))

vi.mock('../../services/categories.service', () => ({
  categoriesService: { list: vi.fn() },
}))

vi.mock('../../services/units.service', () => ({
  unitsService: { list: vi.fn() },
}))

vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({ token: 'test-token' }),
}))

const createProduct = vi.mocked(productsService.create)
const listCategories = vi.mocked(categoriesService.list)
const listUnits = vi.mocked(unitsService.list)

async function renderForm() {
  const onCreated = vi.fn()
  const onCancel = vi.fn()
  const user = userEvent.setup()
  render(<CreateProductForm onCreated={onCreated} onCancel={onCancel} />)
  await waitFor(() => expect(screen.getByLabelText('Categoría')).toBeEnabled())
  return { user, onCreated, onCancel }
}

async function fillValid(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText('Nombre'), ' Whey Protein 2 lb ')
  await user.type(screen.getByLabelText('Código de referencia'), 'WHEY-2LB-001')
  await user.selectOptions(screen.getByLabelText('Categoría'), 'Proteínas')
  await user.selectOptions(screen.getByLabelText('Unidad de medida'), 'Unidad (und)')
  await user.type(screen.getByLabelText('Precio de venta (COP)'), '145000,5')
}

function submit(user: ReturnType<typeof userEvent.setup>) {
  return user.click(screen.getByRole('button', { name: 'Registrar producto' }))
}

beforeEach(() => {
  vi.resetAllMocks()
  listCategories.mockResolvedValue(optionsPage(CATEGORIES))
  listUnits.mockResolvedValue(optionsPage(UNITS))
  createProduct.mockResolvedValue(buildProduct())
})

describe('CreateProductForm', () => {
  it('only offers active categories and units', async () => {
    await renderForm()

    expect(listCategories).toHaveBeenCalledWith({ page: 1, limit: 100, active: true }, 'test-token')
    expect(listUnits).toHaveBeenCalledWith({ page: 1, limit: 100, active: true }, 'test-token')
    expect(
      within(screen.getByLabelText('Categoría'))
        .getAllByRole('option')
        .map((option) => option.textContent),
    ).toEqual(['Selecciona', 'Proteínas', 'Vitaminas'])
    expect(
      within(screen.getByLabelText('Unidad de medida'))
        .getAllByRole('option')
        .map((option) => option.textContent),
    ).toEqual(['Selecciona', 'Unidad (und)', 'Kilogramo (kg)'])
  })

  it('sends the product with the price as text with two decimals', async () => {
    const { user, onCreated } = await renderForm()

    await fillValid(user)
    await submit(user)

    await waitFor(() =>
      expect(createProduct).toHaveBeenCalledWith(
        {
          name: 'Whey Protein 2 lb',
          referenceCode: 'WHEY-2LB-001',
          categoryId: 'cat-protein',
          unitOfMeasureId: 'unit-und',
          price: '145000.50',
        },
        'test-token',
      ),
    )
    expect(onCreated).toHaveBeenCalledWith(buildProduct())
  })

  it('sends the description only when it was written', async () => {
    const { user } = await renderForm()

    await fillValid(user)
    await user.type(screen.getByLabelText('Descripción (opcional)'), ' Sabor vainilla ')
    await submit(user)

    await waitFor(() =>
      expect(createProduct).toHaveBeenCalledWith(
        expect.objectContaining({ description: 'Sabor vainilla' }),
        'test-token',
      ),
    )
  })

  it('previews how the price will look', async () => {
    const { user } = await renderForm()

    await user.type(screen.getByLabelText('Precio de venta (COP)'), '145000')

    expect(screen.getByText('Se mostrará como $ 145.000.')).toBeInTheDocument()
  })

  it('asks for every required field', async () => {
    const { user } = await renderForm()

    await submit(user)

    expect(await screen.findByText('Ingresa el nombre del producto')).toBeInTheDocument()
    expect(screen.getByText('El código debe tener entre 2 y 50 caracteres')).toBeInTheDocument()
    expect(screen.getByText('Selecciona una categoría')).toBeInTheDocument()
    expect(screen.getByText('Selecciona una unidad de medida')).toBeInTheDocument()
    expect(screen.getByText('Ingresa el precio')).toBeInTheDocument()
    expect(createProduct).not.toHaveBeenCalled()
  })

  it('checks the reference code characters and the price format', async () => {
    const { user } = await renderForm()

    await fillValid(user)
    await user.clear(screen.getByLabelText('Código de referencia'))
    await user.type(screen.getByLabelText('Código de referencia'), 'WHEY 2LB')
    await user.clear(screen.getByLabelText('Precio de venta (COP)'))
    await user.type(screen.getByLabelText('Precio de venta (COP)'), '145.000')
    await submit(user)

    expect(
      await screen.findByText('Usa solo letras, números, guiones (-) o guion bajo (_)'),
    ).toBeInTheDocument()
    expect(
      screen.getByText('Escribe el precio con números, sin puntos de miles y hasta 2 decimales'),
    ).toBeInTheDocument()
    expect(createProduct).not.toHaveBeenCalled()
  })

  it('shows the duplicated reference code on its field', async () => {
    createProduct.mockRejectedValue(
      new ApiError('Duplicated', 409, {}, 'PRODUCT_REFERENCE_CODE_ALREADY_EXISTS'),
    )
    const { user, onCreated } = await renderForm()

    await fillValid(user)
    await submit(user)

    expect(
      await screen.findByText(
        'Ese código de referencia ya lo tiene otro producto. Usa uno diferente.',
      ),
    ).toBeInTheDocument()
    expect(screen.getByLabelText('Código de referencia')).toHaveFocus()
    expect(onCreated).not.toHaveBeenCalled()
  })

  it.each([
    ['CATEGORY_INACTIVE', 'Categoría', 'Esta categoría se desactivó. Elige otra categoría activa.'],
    ['UNIT_INACTIVE', 'Unidad de medida', 'Esta unidad se desactivó. Elige otra unidad activa.'],
  ])('shows %s on its field and reloads the options', async (code, label, message) => {
    createProduct.mockRejectedValue(new ApiError('Inactive', 422, {}, code))
    const { user } = await renderForm()
    const requests = listCategories.mock.calls.length

    await fillValid(user)
    await submit(user)

    expect(await screen.findByText(message)).toBeInTheDocument()
    expect(screen.getByLabelText(label)).toHaveAttribute('aria-invalid', 'true')
    await waitFor(() => expect(listCategories.mock.calls.length).toBeGreaterThan(requests))
  })

  it('shows any other api error', async () => {
    createProduct.mockRejectedValue(new ApiError('Forbidden', 403))
    const { user } = await renderForm()

    await fillValid(user)
    await submit(user)

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No tienes permiso para realizar esta acción.',
    )
  })

  it('explains what is missing when there are no active categories or units', async () => {
    listUnits.mockResolvedValue(optionsPage([]))
    await renderForm()

    expect(screen.getByRole('status')).toHaveTextContent(
      'necesitas al menos una categoría y una unidad de medida activas',
    )
    expect(screen.getByRole('button', { name: 'Registrar producto' })).toBeDisabled()
  })

  it('cancels without saving', async () => {
    const { user, onCancel } = await renderForm()

    await user.click(screen.getByRole('button', { name: 'Cancelar' }))

    expect(onCancel).toHaveBeenCalledTimes(1)
    expect(createProduct).not.toHaveBeenCalled()
  })
})
