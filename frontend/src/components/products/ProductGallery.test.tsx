import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import type { ProductImage } from '../../types/product'

import { ProductGallery } from './ProductGallery'

function image(id: string, isPrimary: boolean, sortOrder: number): ProductImage {
  return {
    id,
    url: `https://cdn.example.com/${id}.webp`,
    fileName: `${id}.webp`,
    mimeType: 'image/webp',
    sizeBytes: 1000,
    isPrimary,
    sortOrder,
  }
}

describe('ProductGallery', () => {
  it('leaves room for five images when there are none', () => {
    const { container } = render(<ProductGallery name="Whey" images={[]} />)

    expect(screen.getByText('Sin imágenes todavía')).toBeInTheDocument()
    expect(screen.getByText(/hasta 5 imágenes JPG, PNG, WebP o AVIF/)).toBeInTheDocument()
    expect(container.querySelectorAll('.product-gallery__slot')).toHaveLength(5)
  })

  it('shows the primary image first and fills the remaining slots', () => {
    const { container } = render(
      <ProductGallery
        name="Whey"
        images={[image('second', false, 1), image('main', true, 5), image('first', false, 0)]}
      />,
    )

    expect(screen.getByRole('img', { name: 'Whey: imagen principal' })).toHaveAttribute(
      'src',
      'https://cdn.example.com/main.webp',
    )
    expect(screen.getByRole('button', { name: 'Ver imagen 1 de 3' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(container.querySelectorAll('.product-gallery__slot')).toHaveLength(2)
  })

  it('switches the main image from the thumbnails', async () => {
    const user = userEvent.setup()
    render(
      <ProductGallery name="Whey" images={[image('main', true, 0), image('back', false, 1)]} />,
    )

    await user.click(screen.getByRole('button', { name: 'Ver imagen 2 de 2' }))

    expect(screen.getByRole('img', { name: 'Whey: imagen principal' })).toHaveAttribute(
      'src',
      'https://cdn.example.com/back.webp',
    )
  })
})
