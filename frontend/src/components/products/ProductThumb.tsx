import './ProductThumb.css'

interface ProductThumbProps {
  imageUrl?: string | null
  name: string
  muted?: boolean
}

export function ProductThumb({ imageUrl, name, muted = false }: ProductThumbProps) {
  return (
    <span className={`product-thumb${muted ? ' product-thumb--muted' : ''}`}>
      {imageUrl ? (
        <img className="product-thumb__image" src={imageUrl} alt="" loading="lazy" />
      ) : (
        <svg
          className="product-thumb__icon"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          aria-hidden="true"
        >
          <path d="M21 8 12 3 3 8v8l9 5 9-5V8Z" />
          <path d="m3 8 9 5 9-5" />
          <path d="M12 13v8" />
        </svg>
      )}
      <span className="sr-only">{imageUrl ? `Imagen de ${name}` : `${name} sin imagen`}</span>
    </span>
  )
}
