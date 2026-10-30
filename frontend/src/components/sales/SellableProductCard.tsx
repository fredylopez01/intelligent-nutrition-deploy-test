import type { SellableProduct } from '../../types/sale'
import { formatQuantity } from '../../utils/inventory'
import { formatPrice } from '../../utils/products'
import { MediaPlaceholder } from '../ui/MediaPlaceholder'

import './PointOfSale.css'

interface SellableProductCardProps {
  product: SellableProduct
  inSelection: number
  canSelect: boolean
  onAdd: (product: SellableProduct) => void
}

export function SellableProductCard({
  product,
  inSelection,
  canSelect,
  onAdd,
}: SellableProductCardProps) {
  const unit = product.unit ?? 'und'
  const remaining = product.availableQuantity - inSelection
  return (
    <li className="pos-card">
      <div className="pos-card__media">
        {product.primaryImageUrl ? (
          <img src={product.primaryImageUrl} alt="" loading="lazy" />
        ) : (
          <MediaPlaceholder label="Sin imagen" />
        )}
        {inSelection > 0 && (
          <span className="pos-card__badge" aria-label={`${inSelection} en la venta`}>
            {inSelection}
          </span>
        )}
      </div>
      <div className="pos-card__body">
        <span className="pos-card__name">{product.name}</span>
        <span className="pos-card__ref">{product.referenceCode}</span>
        <div className="pos-card__footer">
          <span className="pos-card__price">{formatPrice(product.price)}</span>
          <span
            className={`pos-card__stock${product.availableQuantity <= 3 ? ' pos-card__stock--low' : ''}`}
          >
            {formatQuantity(product.availableQuantity, unit)} disponibles
          </span>
        </div>
        {canSelect && (
          <button
            type="button"
            className="pos-card__add"
            onClick={() => onAdd(product)}
            disabled={remaining <= 0}
            aria-label={
              remaining <= 0
                ? `${product.name}: ya agregaste todas las unidades disponibles`
                : `Agregar ${product.name} a la venta`
            }
          >
            {remaining <= 0 ? 'Sin más unidades' : 'Agregar'}
          </button>
        )}
      </div>
    </li>
  )
}
