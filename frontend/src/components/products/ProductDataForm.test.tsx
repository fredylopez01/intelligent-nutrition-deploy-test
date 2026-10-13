import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { categoriesService } from '../../services/categories.service'
import { ApiError } from '../../services/http'
import { productsService } from '../../services/products.service'
import { unitsService } from '../../services/units.service'
import { CATEGORIES, UNITS, buildProduct, optionsPage } from '../../test-utils/products'
import type { Product } from '../../types/product'

import { ProductDataForm } from './ProductDataForm'

vi.mock('../../services/products.service', () => ({
  productsService: { update: vi.fn() },
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

const updateProduct = vi.mocked(productsService.update)

const whey = buildProduct()

function field(label: string) {
  return screen.getByLabelText(label)
}

function renderForm(product: Product = whey, canEdit = true) {
  const onSaved = vi.fn()
  const user = userEvent.setup()
  render(<ProductDataForm product={product} canEdit={canEdit} onSaved={onSaved} />)
  return { user, onSaved }
}

async function startEditing(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'Editar producto' }))
  await waitFor(() => expect(field('Categoría')).toBeEnabled())
}

function save(user: ReturnType<typeof userEvent.setup>) {
  return user.click(screen.getByRole('button', { name: 'Guardar cambios' }))
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(categoriesService.list).mockResolvedValue(optionsPage(CATEGORIES))
  vi.mocked(unitsService.list).mockResolvedValue(optionsPage(UNITS))
  updateProduct.mockResolvedValue(whey)
})

describe('ProductDataForm read only', () => {
  it('shows every field read only until editing', () => {
    renderForm()

    expect(field('Nombre')).toHaveAttribute('readonly')
    expect(field('Código de referencia')).toHaveValue('WHEY-2LB-001')
    expect(field('Categoría')).toHaveValue('Proteínas')
    expect(field('Unidad de medida')).toHaveValue('Unidad (und)')
    expect(field('Precio de venta (COP)')).toHaveValue('145000')
    expect(screen.queryByRole('button', { name: 'Guardar cambios' })).not.toBeInTheDocument()
  })

  it('hides the edit button from who cannot edit', () => {
    renderForm(whey, false)

    expect(screen.queryByRole('button', { name: 'Editar producto' })).not.toBeInTheDocument()
  })
})

describe('ProductDataForm editing', () => {
  it('preloads the values and keeps the reference code locked', async () => {
    const { user } = renderForm()

    await startEditing(user)

    expect(field('Nombre')).not.toHaveAttribute('readonly')
    expect(field('Nombre')).toHaveFocus()
    expect(field('Código de referencia')).toHaveAttribute('readonly')
    expect(field('Categoría')).toHaveValue('cat-protein')
    expect(field('Unidad de medida')).toHaveValue('unit-und')
    expect(
      screen.getByText('El código no se puede cambiar después de crear el producto.'),
    ).toBeInTheDocument()
  })

  it('sends only what changed, never the reference code', async () => {
    const { user, onSaved } = renderForm()
    await startEditing(user)

    await user.selectOptions(field('Categoría'), 'Vitaminas')
    await user.selectOptions(field('Unidad de medida'), 'Kilogramo (kg)')
    await user.clear(field('Precio de venta (COP)'))
    await user.type(field('Precio de venta (COP)'), '150000,5')
    await save(user)

    await waitFor(() =>
      expect(updateProduct).toHaveBeenCalledWith(
        'product-whey',
        { categoryId: 'cat-vitamins', unitOfMeasureId: 'unit-kg', price: '150000.50' },
        'test-token',
      ),
    )
    expect(onSaved).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('status')).toHaveTextContent('Producto actualizado exitosamente.')
    expect(field('Nombre')).toHaveAttribute('readonly')
  })

  it('treats the same price written differently as unchanged', async () => {
    const { user } = renderForm()
    await startEditing(user)

    await user.clear(field('Precio de venta (COP)'))
    await user.type(field('Precio de venta (COP)'), '145000,00')
    await save(user)

    expect(await screen.findByRole('alert')).toHaveTextContent('No hay cambios por guardar.')
    expect(updateProduct).not.toHaveBeenCalled()
  })

  it('lets the description be cleared', async () => {
    const { user } = renderForm()
    await startEditing(user)

    await user.clear(field('Descripción (opcional)'))
    await save(user)

    await waitFor(() =>
      expect(updateProduct).toHaveBeenCalledWith('product-whey', { description: '' }, 'test-token'),
    )
  })

  it('keeps an inactive current category as an option without sending it', async () => {
    const product = buildProduct({ category: { id: 'cat-old', name: 'Snacks' } })
    const { user } = renderForm(product)
    await startEditing(user)

    expect(screen.getByRole('option', { name: 'Snacks (inactiva)' })).toBeInTheDocument()
    expect(field('Categoría')).toHaveValue('cat-old')
    await user.clear(field('Nombre'))
    await user.type(field('Nombre'), 'Whey 2 lb')
    await save(user)

    await waitFor(() =>
      expect(updateProduct).toHaveBeenCalledWith(
        'product-whey',
        { name: 'Whey 2 lb' },
        'test-token',
      ),
    )
  })

  it('shows an inactive category error on its field', async () => {
    updateProduct.mockRejectedValue(new ApiError('Inactive', 422, {}, 'CATEGORY_INACTIVE'))
    const { user } = renderForm()
    await startEditing(user)

    await user.selectOptions(field('Categoría'), 'Vitaminas')
    await save(user)

    expect(
      await screen.findByText('Esta categoría se desactivó. Elige otra categoría activa.'),
    ).toBeInTheDocument()
  })

  it('shows any other api error', async () => {
    updateProduct.mockRejectedValue(new ApiError('Not editable', 400, {}, 'FIELD_NOT_EDITABLE'))
    const { user } = renderForm()
    await startEditing(user)

    await user.clear(field('Nombre'))
    await user.type(field('Nombre'), 'Whey 2 lb')
    await save(user)

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'El código de referencia no se puede cambiar después de crear el producto.',
    )
  })

  it('cancels and restores the saved values', async () => {
    const { user } = renderForm()
    await startEditing(user)

    await user.clear(field('Nombre'))
    await user.type(field('Nombre'), 'Otro nombre')
    await user.click(screen.getByRole('button', { name: 'Cancelar' }))

    expect(field('Nombre')).toHaveValue('Whey Protein 2 lb')
    expect(field('Nombre')).toHaveAttribute('readonly')
    expect(updateProduct).not.toHaveBeenCalled()
  })

  it('disables both buttons and shows "Guardando..." while saving', async () => {
    updateProduct.mockReturnValue(new Promise(() => {}))
    const { user } = renderForm()
    await startEditing(user)

    await user.clear(field('Nombre'))
    await user.type(field('Nombre'), 'Nuevo nombre')
    await save(user)

    expect(await screen.findByRole('button', { name: 'Guardando...' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Cancelar' })).toBeDisabled()
  })

  it('keeps an inactive current unit as an option without sending it', async () => {
    const product = buildProduct({
      unitOfMeasure: { id: 'unit-old', name: 'Onza', abbreviation: 'oz' },
    })
    const { user } = renderForm(product)
    await startEditing(user)

    expect(screen.getByRole('option', { name: 'Onza (oz) (inactiva)' })).toBeInTheDocument()
    expect(field('Unidad de medida')).toHaveValue('unit-old')
    await user.clear(field('Nombre'))
    await user.type(field('Nombre'), 'Onza 100 g')
    await save(user)

    await waitFor(() =>
      expect(updateProduct).toHaveBeenCalledWith(
        'product-whey',
        { name: 'Onza 100 g' },
        'test-token',
      ),
    )
  })

  it('shows an inactive unit error on its field', async () => {
    updateProduct.mockRejectedValue(new ApiError('Inactive', 422, {}, 'UNIT_INACTIVE'))
    const { user } = renderForm()
    await startEditing(user)

    await user.selectOptions(field('Unidad de medida'), 'Kilogramo (kg)')
    await save(user)

    expect(
      await screen.findByText('Esta unidad se desactivó. Elige otra unidad activa.'),
    ).toBeInTheDocument()
  })

  it.each<[number, string]>([
    [403, 'No tienes permiso para realizar esta acción.'],
    [404, 'Este producto ya no existe. Recarga el listado.'],
  ])('shows a status %i api error as a general alert', async (status, message) => {
    updateProduct.mockRejectedValue(new ApiError('Error', status))
    const { user } = renderForm()
    await startEditing(user)

    await user.clear(field('Nombre'))
    await user.type(field('Nombre'), 'Nuevo nombre')
    await save(user)

    expect(await screen.findByRole('alert')).toHaveTextContent(message)
  })
})
