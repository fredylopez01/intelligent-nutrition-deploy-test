import { fireEvent, render, screen } from '@testing-library/react'
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

  it('highlights the primary image and lists the thumbnails by sort order', () => {
    const { container } = render(
      <ProductGallery
        name="Whey"
        images={[image('second', false, 1), image('main', true, 2), image('first', false, 0)]}
      />,
    )

    expect(screen.getByRole('img', { name: 'Whey: imagen principal' })).toHaveAttribute(
      'src',
      'https://cdn.example.com/main.webp',
    )
    expect(screen.getByText('Principal')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Ver imagen 3 de 3 (principal)' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    const thumbs = screen.getAllByRole('button', { name: /Ver imagen/ })
    expect(thumbs.map((thumb) => thumb.querySelector('img')?.getAttribute('src'))).toEqual([
      'https://cdn.example.com/first.webp',
      'https://cdn.example.com/second.webp',
      'https://cdn.example.com/main.webp',
    ])
    expect(container.querySelectorAll('.product-gallery__slot')).toHaveLength(2)
  })

  it('loads the thumbnails lazily', () => {
    render(<ProductGallery name="Whey" images={[image('main', true, 0)]} />)

    const thumb = screen.getByRole('button', { name: 'Ver imagen 1 de 1 (principal)' })
    expect(thumb.querySelector('img')).toHaveAttribute('loading', 'lazy')
  })

  it('switches the main image from the thumbnails', async () => {
    const user = userEvent.setup()
    render(
      <ProductGallery name="Whey" images={[image('main', true, 0), image('back', false, 1)]} />,
    )

    await user.click(screen.getByRole('button', { name: 'Ver imagen 2 de 2' }))

    expect(screen.getByRole('img', { name: 'Whey: imagen 2' })).toHaveAttribute(
      'src',
      'https://cdn.example.com/back.webp',
    )
    expect(screen.queryByText('Principal')).not.toBeInTheDocument()
  })

  it('shows the placeholder when the main image fails to load', () => {
    render(<ProductGallery name="Whey" images={[image('main', true, 0)]} />)

    fireEvent.error(screen.getByRole('img', { name: 'Whey: imagen principal' }))

    expect(screen.getByRole('status')).toHaveTextContent('No se pudo cargar la imagen')
    expect(screen.queryByRole('img', { name: 'Whey: imagen principal' })).not.toBeInTheDocument()
  })

  it('keeps the other images visible when one thumbnail fails', () => {
    render(
      <ProductGallery name="Whey" images={[image('main', true, 0), image('broken', false, 1)]} />,
    )

    const broken = screen.getByRole('button', { name: 'Ver imagen 2 de 2' })
    fireEvent.error(broken.querySelector('img') as HTMLImageElement)

    expect(broken.querySelector('img')).toBeNull()
    expect(screen.getByRole('img', { name: 'Whey: imagen principal' })).toBeInTheDocument()
  })
})
