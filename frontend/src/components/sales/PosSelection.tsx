import type { SellableProduct } from '../../types/sale'
import { formatPrice } from '../../utils/products'

import './PointOfSale.css'

export interface SelectionLine {
  product: SellableProduct
  quantity: number
}

interface PosSelectionProps {
  lines: SelectionLine[]
  onChangeQuantity: (productId: string, quantity: number) => void
  onRemove: (productId: string) => void
  onClear: () => void
}

export function PosSelection({ lines, onChangeQuantity, onRemove, onClear }: PosSelectionProps) {
  const units = lines.reduce((sum, line) => sum + line.quantity, 0)
  const total = lines.reduce((sum, line) => sum + Number(line.product.price) * line.quantity, 0)

  return (
    <aside className="pos-selection" aria-labelledby="pos-selection-title">
      <div className="pos-selection__head">
        <h2 id="pos-selection-title" className="pos-selection__title">
          Venta en curso
        </h2>
        {lines.length > 0 && (
          <button type="button" className="pos-selection__clear" onClick={onClear}>
            Vaciar
          </button>
        )}
      </div>

      {lines.length === 0 ? (
        <p className="pos-selection__empty">
          Agrega productos desde el panel. Solo aparecen los que tienen unidades vigentes en la
          sede.
        </p>
      ) : (
        <ul className="pos-selection__lines" aria-label="Productos de la venta">
          {lines.map(({ product, quantity }) => (
            <li key={product.productId} className="pos-selection__line">
              <div className="pos-selection__info">
                <span className="pos-selection__name">{product.name}</span>
                <span className="pos-selection__unit-price">
                  {formatPrice(product.price)} c/u · {formatPrice(Number(product.price) * quantity)}
                </span>
              </div>
              <div
                className="pos-selection__stepper"
                role="group"
                aria-label={`Cantidad de ${product.name}`}
              >
                <button
                  type="button"
                  aria-label={`Quitar una unidad de ${product.name}`}
                  onClick={() =>
                    quantity <= 1
                      ? onRemove(product.productId)
                      : onChangeQuantity(product.productId, quantity - 1)
                  }
                >
                  −
                </button>
                <span aria-live="polite">{quantity}</span>
                <button
                  type="button"
                  aria-label={`Agregar una unidad de ${product.name}`}
                  onClick={() => onChangeQuantity(product.productId, quantity + 1)}
                  disabled={quantity >= product.availableQuantity}
                >
                  +
                </button>
              </div>
              <button
                type="button"
                className="pos-selection__remove"
                aria-label={`Quitar ${product.name} de la venta`}
                onClick={() => onRemove(product.productId)}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}

      <dl className="pos-selection__totals">
        <div>
          <dt>Unidades</dt>
          <dd>{units}</dd>
        </div>
        <div className="pos-selection__total">
          <dt>Total de lista</dt>
          <dd>{formatPrice(total)}</dd>
        </div>
      </dl>
      <p className="pos-selection__note">
        Precio de lista. Los descuentos, impuestos y el cobro se registran al finalizar la venta.
      </p>
    </aside>
  )
}
