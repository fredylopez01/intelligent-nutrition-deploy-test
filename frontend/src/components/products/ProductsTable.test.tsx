import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { describe, expect, it } from 'vitest'

import { buildProduct } from '../../test-utils/products'

import { ProductsTable } from './ProductsTable'

const whey = buildProduct()
const creatine = buildProduct({
  id: 'product-creatine',
  name: 'Creatina 300 g',
  referenceCode: 'CREA-300G',
  price: '89900.50',
  active: false,
  primaryImageUrl: 'https://cdn.example.com/creatina.webp',
})

function DetailProbe() {
  const location = useLocation()
  return <p>{`detalle ${location.pathname} desde ${(location.state as { from: string }).from}`}</p>
}

function renderTable() {
  const user = userEvent.setup()
  render(
    <MemoryRouter initialEntries={['/catalogo']}>
      <Routes>
        <Route
          path="/catalogo"
          element={<ProductsTable products={[whey, creatine]} returnTo="/catalogo?pagina=2" />}
        />
        <Route path="/catalogo/productos/:productId" element={<DetailProbe />} />
      </Routes>
    </MemoryRouter>,
  )
  return { user }
}

function rowOf(name: string) {
  return screen.getByRole('link', { name: `Ver detalle de ${name}` }).closest('tr') as HTMLElement
}

describe('ProductsTable', () => {
  it('shows the reference, name, category, unit, price and state', () => {
    renderTable()

    const row = within(rowOf('Whey Protein 2 lb'))
    expect(row.getByText('WHEY-2LB-001')).toBeInTheDocument()
    expect(row.getByText('Proteínas')).toBeInTheDocument()
    expect(row.getByText('und')).toBeInTheDocument()
    expect(row.getByText('$ 145.000')).toBeInTheDocument()
    expect(row.getByText('Activo')).toBeInTheDocument()
    expect(within(rowOf('Creatina 300 g')).getByText('$ 89.900,50')).toBeInTheDocument()
    expect(within(rowOf('Creatina 300 g')).getByText('Inactivo')).toBeInTheDocument()
  })

  it('shows the primary image or a placeholder', () => {
    const { container } = render(
      <MemoryRouter>
        <ProductsTable products={[whey, creatine]} returnTo="/catalogo" />
      </MemoryRouter>,
    )

    expect(screen.getByText('Whey Protein 2 lb sin imagen')).toBeInTheDocument()
    expect(container.querySelector('img')).toHaveAttribute(
      'src',
      'https://cdn.example.com/creatina.webp',
    )
  })

  it('opens the detail remembering the list', async () => {
    const { user } = renderTable()

    await user.click(screen.getByRole('link', { name: 'Ver detalle de Creatina 300 g' }))

    expect(
      screen.getByText('detalle /catalogo/productos/product-creatine desde /catalogo?pagina=2'),
    ).toBeInTheDocument()
  })
})
