import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { ProductThumb } from './ProductThumb'

describe('ProductThumb', () => {
  it('loads the primary image lazily', () => {
    const { container } = render(
      <ProductThumb imageUrl="https://cdn.example.com/whey.webp" name="Whey" />,
    )

    expect(container.querySelector('img')).toHaveAttribute('loading', 'lazy')
    expect(screen.getByText('Imagen de Whey')).toBeInTheDocument()
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
})
