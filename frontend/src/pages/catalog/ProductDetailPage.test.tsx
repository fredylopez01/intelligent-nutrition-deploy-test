import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { categoriesService } from '../../services/categories.service'
import { ApiError } from '../../services/http'
import { productsService } from '../../services/products.service'
import { unitsService } from '../../services/units.service'
import { CATEGORIES, UNITS, buildProduct, optionsPage } from '../../test-utils/products'

import { ProductDetailPage } from './ProductDetailPage'

const auth = vi.hoisted(() => ({ role: 'SUPERADMIN' }))

vi.mock('../../services/products.service', () => ({
  productsService: { getById: vi.fn(), update: vi.fn(), updateStatus: vi.fn() },
}))

vi.mock('../../services/categories.service', () => ({
  categoriesService: { list: vi.fn() },
}))

vi.mock('../../services/units.service', () => ({
  unitsService: { list: vi.fn() },
}))

vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({ token: 'test-token', user: { id: 'me', role: { name: auth.role } } }),
}))

vi.mock('../../layouts/AppLayout', () => ({
  AppLayout: ({
    title,
    backTo,
    backLabel,
    actions,
    children,
  }: {
    title: string
    backTo?: string
    backLabel?: string
    actions?: ReactNode
    children: ReactNode
  }) => (
    <main>
      {backTo && <a href={backTo}>{backLabel}</a>}
      <h1>{title}</h1>
      {actions}
      {children}
    </main>
  ),
}))

const getProduct = vi.mocked(productsService.getById)
const updateProduct = vi.mocked(productsService.update)
const updateStatus = vi.mocked(productsService.updateStatus)

const whey = buildProduct()

function renderPage(productId = 'product-whey', from?: string) {
  const user = userEvent.setup()
  render(
    <MemoryRouter
      initialEntries={[
        { pathname: `/catalogo/productos/${productId}`, state: from ? { from } : null },
      ]}
    >
      <Routes>
        <Route path="/catalogo/productos/:productId" element={<ProductDetailPage />} />
      </Routes>
    </MemoryRouter>,
  )
  return { user }
}

async function waitForProduct() {
  return screen.findByRole('heading', { level: 1, name: 'Whey Protein 2 lb' })
}

beforeEach(() => {
  vi.resetAllMocks()
  auth.role = 'SUPERADMIN'
  getProduct.mockResolvedValue(whey)
  vi.mocked(categoriesService.list).mockResolvedValue(optionsPage(CATEGORIES))
  vi.mocked(unitsService.list).mockResolvedValue(optionsPage(UNITS))
})

describe('ProductDetailPage view', () => {
  it('shows every product attribute and a way back to the list', async () => {
    renderPage('product-whey', '/catalogo?pagina=2')
    await waitForProduct()

    const profile = within(screen.getByRole('region', { name: 'Whey Protein 2 lb' }))
    expect(profile.getByText('WHEY-2LB-001')).toBeInTheDocument()
    expect(profile.getByText('Activo')).toBeInTheDocument()
    expect(profile.getByText('$ 145.000')).toBeInTheDocument()
    expect(profile.getByText('Proteínas')).toBeInTheDocument()
    expect(profile.getByText('Unidad (und)')).toBeInTheDocument()
    expect(screen.getByLabelText('Descripción')).toHaveValue('Proteína de suero')
    expect(screen.getByRole('link', { name: 'Volver al listado de productos' })).toHaveAttribute(
      'href',
      '/catalogo?pagina=2',
    )
  })

  it('leaves room for the images while the product has none', async () => {
    renderPage()
    await waitForProduct()

    expect(screen.getByRole('region', { name: 'Imágenes de Whey Protein 2 lb' })).toHaveTextContent(
      'Sin imágenes todavía',
    )
  })

  it('shows the primary image when the product has one', async () => {
    getProduct.mockResolvedValue(
      buildProduct({
        images: [
          {
            id: 'image-1',
            url: 'https://cdn.example.com/whey.webp',
            fileName: 'whey.webp',
            mimeType: 'image/webp',
            sizeBytes: 1000,
            isPrimary: true,
            sortOrder: 0,
          },
        ],
      }),
    )
    renderPage()
    await waitForProduct()

    expect(
      screen.getByRole('img', { name: 'Whey Protein 2 lb: imagen principal' }),
    ).toHaveAttribute('src', 'https://cdn.example.com/whey.webp')
  })

  it('tells when the product does not exist', async () => {
    getProduct.mockRejectedValue(new ApiError('Product not found', 404))
    renderPage('missing')

    expect(await screen.findByText('Este producto no existe')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Volver al listado' })).toHaveAttribute(
      'href',
      '/catalogo',
    )
  })

  it('retries after a loading error', async () => {
    getProduct.mockRejectedValueOnce(new ApiError('Boom', 500))
    const { user } = renderPage()

    expect(await screen.findByText('No se pudo cargar el producto')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Reintentar' }))

    expect(await waitForProduct()).toBeInTheDocument()
  })

  it('warns that an inactive product cannot be used in new operations', async () => {
    getProduct.mockResolvedValue(buildProduct({ active: false }))
    renderPage()
    await waitForProduct()

    expect(screen.getByRole('status')).toHaveTextContent('Este producto está inactivo')
  })
})

describe('ProductDetailPage edit', () => {
  it('edits the product from the detail and shows the saved values', async () => {
    updateProduct.mockResolvedValue(whey)
    const { user } = renderPage()
    await waitForProduct()

    await user.click(screen.getByRole('button', { name: 'Editar producto' }))
    await waitFor(() => expect(screen.getByLabelText('Categoría')).toHaveValue('cat-protein'))
    getProduct.mockResolvedValue(buildProduct({ price: '149900.00' }))
    await user.clear(screen.getByLabelText('Precio de venta (COP)'))
    await user.type(screen.getByLabelText('Precio de venta (COP)'), '149900')
    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }))

    expect(await screen.findByText('Producto actualizado exitosamente.')).toBeInTheDocument()
    expect(updateProduct).toHaveBeenCalledWith('product-whey', { price: '149900.00' }, 'test-token')
    const profile = within(screen.getByRole('region', { name: 'Whey Protein 2 lb' }))
    expect(await profile.findByText('$ 149.900')).toBeInTheDocument()
  })

  it('only lets the branch assistant consult', async () => {
    auth.role = 'BRANCH_ASSISTANT'
    renderPage()
    await waitForProduct()

    expect(screen.queryByRole('button', { name: 'Editar producto' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /producto$/ })).not.toBeInTheDocument()
  })
})

describe('ProductDetailPage state', () => {
  it('deactivates the product after confirming', async () => {
    updateStatus.mockResolvedValue({ message: 'ok' })
    const { user } = renderPage()
    await waitForProduct()

    await user.click(screen.getByRole('button', { name: 'Desactivar producto' }))
    const dialog = screen.getByRole('dialog', { name: '¿Desactivar este producto?' })
    expect(dialog).toHaveTextContent('Su historial y existencias se conservan')
    getProduct.mockResolvedValue(buildProduct({ active: false }))
    await user.click(within(dialog).getByRole('button', { name: 'Sí, desactivar' }))

    expect(await screen.findByText('El producto ahora está inactivo.')).toBeInTheDocument()
    expect(updateStatus).toHaveBeenCalledWith('product-whey', { active: false }, 'test-token')
    expect(await screen.findByRole('button', { name: 'Activar producto' })).toBeInTheDocument()
  })

  it('lets the branch leader change the state, as the contract allows', async () => {
    auth.role = 'BRANCH_LEADER'
    renderPage()
    await waitForProduct()

    expect(screen.getByRole('button', { name: 'Desactivar producto' })).toBeInTheDocument()
  })

  it('activates an inactive product', async () => {
    updateStatus.mockResolvedValue({ message: 'ok' })
    getProduct.mockResolvedValue(buildProduct({ active: false }))
    const { user } = renderPage()
    await waitForProduct()

    await user.click(screen.getByRole('button', { name: 'Activar producto' }))
    const dialog = screen.getByRole('dialog', { name: '¿Activar este producto?' })
    expect(dialog).toHaveTextContent('volverá a estar disponible')
    getProduct.mockResolvedValue(buildProduct({ active: true }))
    await user.click(within(dialog).getByRole('button', { name: 'Sí, activar' }))

    expect(await screen.findByText('El producto ahora está activo.')).toBeInTheDocument()
    expect(updateStatus).toHaveBeenCalledWith('product-whey', { active: true }, 'test-token')
    expect(await screen.findByRole('button', { name: 'Desactivar producto' })).toBeInTheDocument()
  })

  it('keeps the confirmation open when the status change fails', async () => {
    updateStatus.mockRejectedValue(new ApiError('State', 409, {}, 'ALREADY_IN_STATE'))
    const { user } = renderPage()
    await waitForProduct()

    await user.click(screen.getByRole('button', { name: 'Desactivar producto' }))
    await user.click(screen.getByRole('button', { name: 'Sí, desactivar' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'El producto ya tenía ese estado. Recarga para ver su estado actual.',
    )
    expect(screen.getByRole('dialog', { name: '¿Desactivar este producto?' })).toBeInTheDocument()
  })
})
