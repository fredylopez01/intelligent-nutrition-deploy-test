import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ApiError } from '../../services/http'
import { productsService } from '../../services/products.service'
import { buildProduct } from '../../test-utils/products'

import { ProductDetailPage } from './ProductDetailPage'

vi.mock('../../services/products.service', () => ({
  productsService: { getById: vi.fn() },
}))

vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({ token: 'test-token' }),
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
  getProduct.mockResolvedValue(whey)
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
    expect(screen.getByText('Proteína de suero')).toBeInTheDocument()
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
