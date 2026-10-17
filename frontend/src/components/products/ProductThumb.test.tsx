import { fireEvent, render, screen } from '@testing-library/react'
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

  it('loads the primary image lazily', () => {
    const { container } = render(
      <ProductThumb imageUrl="https://cdn.example.com/whey.webp" name="Whey" />,
    )

    expect(container.querySelector('img')).toHaveAttribute('loading', 'lazy')
    expect(screen.getByText('Imagen de Whey')).toBeInTheDocument()
  })

  it('shows a placeholder icon when imageUrl is undefined', () => {
    const { container } = render(<ProductThumb name="Leche Entera" />)

    expect(container.querySelector('img')).toBeNull()
    expect(container.querySelector('.product-thumb__icon')).toBeInTheDocument()
  })

  it('shows the placeholder when the product has no image', () => {
    const { container } = render(<ProductThumb imageUrl={null} name="Whey" />)

    expect(container.querySelector('img')).toBeNull()
    expect(screen.getByText('Whey sin imagen')).toBeInTheDocument()
  })

  it('falls back to the placeholder when the image fails to load', () => {
    const { container } = render(
      <ProductThumb imageUrl="https://cdn.example.com/broken.webp" name="Whey" />,
    )

    fireEvent.error(container.querySelector('img') as HTMLImageElement)

    expect(container.querySelector('img')).toBeNull()
    expect(screen.getByText('Whey sin imagen')).toBeInTheDocument()
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
