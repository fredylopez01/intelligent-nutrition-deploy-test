import { useState } from 'react'

import type { ProductImage } from '../../types/product'

import './ProductGallery.css'

const MAX_IMAGES = 5

interface ProductGalleryProps {
  name: string
  images: ProductImage[]
}

function PlaceholderIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true">
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <circle cx="8.5" cy="9.5" r="1.5" />
      <path d="m3 16 5-4 4 3 3-2 6 5" />
    </svg>
  )
}

export function ProductGallery({ name, images }: ProductGalleryProps) {
  const sorted = [...images].sort(
    (a, b) => Number(b.isPrimary) - Number(a.isPrimary) || a.sortOrder - b.sortOrder,
  )
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const selected = sorted.find((image) => image.id === selectedId) ?? sorted[0]
  const emptySlots = Math.max(0, MAX_IMAGES - sorted.length)

  return (
    <section className="product-gallery" aria-label={`Imágenes de ${name}`}>
      <div className="product-gallery__main">
        {selected ? (
          <img
            className="product-gallery__image"
            src={selected.url}
            alt={`${name}: imagen principal`}
          />
        ) : (
          <div className="product-gallery__empty">
            <PlaceholderIcon />
            <p className="product-gallery__empty-title">Sin imágenes todavía</p>
            <p className="product-gallery__empty-text">
              Este producto podrá tener hasta {MAX_IMAGES} imágenes JPG, PNG, WebP o AVIF de máximo
              5 MB.
            </p>
          </div>
        )}
      </div>

      <ul className="product-gallery__thumbs">
        {sorted.map((image, index) => (
          <li key={image.id}>
            <button
              type="button"
              className={`product-gallery__thumb${image.id === selected?.id ? ' product-gallery__thumb--selected' : ''}`}
              aria-label={`Ver imagen ${index + 1} de ${sorted.length}`}
              aria-pressed={image.id === selected?.id}
              onClick={() => setSelectedId(image.id)}
            >
              <img src={image.url} alt="" loading="lazy" />
            </button>
          </li>
        ))}
        {Array.from({ length: emptySlots }, (_, index) => (
          <li key={`slot-${index}`} className="product-gallery__slot" aria-hidden="true">
            <PlaceholderIcon />
          </li>
        ))}
      </ul>
    </section>
  )
}
