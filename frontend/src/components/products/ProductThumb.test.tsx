import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { ProductThumb } from './ProductThumb'

describe('ProductThumb', () => {
  it('shows the product image when a URL is provided', () => {
    const { container } = render(
      <ProductThumb imageUrl="https://cdn.example.com/item.webp" name="Leche Entera" />,
    )

    const img = container.querySelector('img')
    expect(img).toHaveAttribute('src', 'https://cdn.example.com/item.webp')
    expect(img).toHaveAttribute('alt', '')
    expect(screen.getByText('Imagen de Leche Entera')).toBeInTheDocument()
  })

  it('shows a placeholder icon when imageUrl is undefined', () => {
    const { container } = render(<ProductThumb name="Leche Entera" />)

    expect(screen.queryByRole('img')).not.toBeInTheDocument()
    expect(container.querySelector('.product-thumb__icon')).toBeInTheDocument()
  })

  it('shows a placeholder icon when imageUrl is null', () => {
    const { container } = render(<ProductThumb imageUrl={null} name="Leche Entera" />)

    expect(screen.queryByRole('img')).not.toBeInTheDocument()
    expect(container.querySelector('.product-thumb__icon')).toBeInTheDocument()
  })

  it('labels the product as having no image when the URL is missing', () => {
    render(<ProductThumb name="Leche Entera" />)

    expect(screen.getByText('Leche Entera sin imagen')).toBeInTheDocument()
  })

  it('applies the muted style when muted is true', () => {
    const { container } = render(
      <ProductThumb imageUrl="https://cdn.example.com/item.webp" name="Leche Entera" muted={true} />,
    )

    expect(container.firstChild).toHaveClass('product-thumb--muted')
  })

  it('does not apply the muted style by default', () => {
    const { container } = render(
      <ProductThumb imageUrl="https://cdn.example.com/item.webp" name="Leche Entera" />,
    )

    expect(container.firstChild).not.toHaveClass('product-thumb--muted')
  })
})
