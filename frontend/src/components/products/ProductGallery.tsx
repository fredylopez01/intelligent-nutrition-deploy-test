import { useState } from 'react'

import type { ProductImage } from '../../types/product'
import {
  IMAGE_RULES_TEXT,
  MAX_PRODUCT_IMAGES,
  primaryImage,
  sortImages,
} from '../../utils/productImages'

import './ProductGallery.css'

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
  const sorted = sortImages(images)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [failedIds, setFailedIds] = useState<string[]>([])
  const [loadedIds, setLoadedIds] = useState<string[]>([])
  const selected = sorted.find((image) => image.id === selectedId) ?? primaryImage(sorted)
  const emptySlots = Math.max(0, MAX_PRODUCT_IMAGES - sorted.length)

  const markFailed = (imageId: string) =>
    setFailedIds((ids) => (ids.includes(imageId) ? ids : [...ids, imageId]))
  const markLoaded = (imageId: string) =>
    setLoadedIds((ids) => (ids.includes(imageId) ? ids : [...ids, imageId]))

  const renderMain = () => {
    if (!selected) {
      return (
        <div className="product-gallery__empty">
          <PlaceholderIcon />
          <p className="product-gallery__empty-title">Sin imágenes todavía</p>
          <p className="product-gallery__empty-text">
            Este producto podrá tener hasta {MAX_PRODUCT_IMAGES} imágenes {IMAGE_RULES_TEXT}.
          </p>
        </div>
      )
    }

    if (failedIds.includes(selected.id)) {
      return (
        <div className="product-gallery__empty" role="status">
          <PlaceholderIcon />
          <p className="product-gallery__empty-title">No se pudo cargar la imagen</p>
          <p className="product-gallery__empty-text">
            Revisa tu conexión o recarga la página para intentarlo de nuevo.
          </p>
        </div>
      )
    }

    return (
      <>
        <img
          key={selected.id}
          className={`product-gallery__image${loadedIds.includes(selected.id) ? ' product-gallery__image--loaded' : ''}`}
          src={selected.url}
          alt={
            selected.isPrimary
              ? `${name}: imagen principal`
              : `${name}: imagen ${sorted.indexOf(selected) + 1}`
          }
          decoding="async"
          onLoad={() => markLoaded(selected.id)}
          onError={() => markFailed(selected.id)}
        />
        {selected.isPrimary && <span className="product-gallery__badge">Principal</span>}
      </>
    )
  }

  return (
    <section className="product-gallery" aria-label={`Imágenes de ${name}`}>
      <div className="product-gallery__main">{renderMain()}</div>

      <ul className="product-gallery__thumbs">
        {sorted.map((image, index) => {
          const isSelected = image.id === selected?.id
          return (
            <li key={image.id}>
              <button
                type="button"
                className={`product-gallery__thumb${isSelected ? ' product-gallery__thumb--selected' : ''}`}
                aria-label={`Ver imagen ${index + 1} de ${sorted.length}${image.isPrimary ? ' (principal)' : ''}`}
                aria-pressed={isSelected}
                onClick={() => setSelectedId(image.id)}
              >
                {failedIds.includes(image.id) ? (
                  <PlaceholderIcon />
                ) : (
                  <img
                    src={image.url}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    onError={() => markFailed(image.id)}
                  />
                )}
                {image.isPrimary && (
                  <span className="product-gallery__thumb-dot" aria-hidden="true" />
                )}
              </button>
            </li>
          )
        })}
        {Array.from({ length: emptySlots }, (_, index) => (
          <li key={`slot-${index}`} className="product-gallery__slot" aria-hidden="true">
            <PlaceholderIcon />
          </li>
        ))}
      </ul>
    </section>
  )
}
