import type { PaymentMethod } from '../../types/paymentMethod'
import type { SellableProduct } from '../../types/sale'
import { formatPrice } from '../../utils/products'
import { selectionTotalCents } from '../../utils/sales'
import { Button } from '../ui/Button'
import { SelectField } from '../ui/SelectField'
import { TextField } from '../ui/TextField'

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
  paymentMethods: PaymentMethod[]
  paymentStatus: 'loading' | 'success' | 'error'
  paymentMethodId: string
  onPaymentMethodChange: (paymentMethodId: string) => void
  reference: string
  onReferenceChange: (reference: string) => void
  onRetryPaymentMethods: () => void
  onCheckout: () => void
}

const PAYMENT_REFERENCE_MAX_LENGTH = 100

export function PosSelection({
  lines,
  onChangeQuantity,
  onRemove,
  onClear,
  paymentMethods,
  paymentStatus,
  paymentMethodId,
  onPaymentMethodChange,
  reference,
  onReferenceChange,
  onRetryPaymentMethods,
  onCheckout,
}: PosSelectionProps) {
  const units = lines.reduce((sum, line) => sum + line.quantity, 0)
  const total = selectionTotalCents(lines) / 100
  const noMethods = paymentStatus === 'success' && paymentMethods.length === 0

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
                <input
                  className="pos-selection__quantity"
                  aria-label={`Unidades de ${product.name}`}
                  inputMode="numeric"
                  autoComplete="off"
                  value={quantity}
                  onChange={(event) => {
                    const next = Number(event.target.value.replace(/\D/g, ''))
                    if (next > 0) onChangeQuantity(product.productId, next)
                  }}
                  onFocus={(event) => event.target.select()}
                />
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
          <dt>Total</dt>
          <dd>{formatPrice(total)}</dd>
        </div>
      </dl>

      <div className="pos-selection__payment">
        <SelectField
          id="pos-payment-method"
          label="Método de pago"
          placeholder={paymentStatus === 'loading' ? 'Cargando métodos...' : 'Elige el método'}
          options={paymentMethods.map((method) => ({ value: method.id, label: method.name }))}
          value={paymentMethodId}
          onChange={(event) => onPaymentMethodChange(event.target.value)}
          disabled={paymentStatus !== 'success' || noMethods}
        />
        {paymentStatus === 'error' && (
          <p className="pos-selection__note" role="alert">
            No fue posible cargar los métodos de pago.{' '}
            <button type="button" className="pos-selection__clear" onClick={onRetryPaymentMethods}>
              Reintentar
            </button>
          </p>
        )}
        {noMethods && (
          <p className="pos-selection__note" role="alert">
            No hay métodos de pago activos. Pide al superadmin que active uno.
          </p>
        )}
        <TextField
          id="pos-payment-reference"
          label="Referencia del pago (opcional)"
          placeholder="Ej. número de la transferencia"
          autoComplete="off"
          maxLength={PAYMENT_REFERENCE_MAX_LENGTH}
          value={reference}
          onChange={(event) => onReferenceChange(event.target.value)}
        />
      </div>

      <Button onClick={onCheckout} disabled={lines.length === 0 || !paymentMethodId}>
        Finalizar venta
      </Button>
      <p className="pos-selection__note">
        Precios vigentes de la sede. El sistema confirma el total y descuenta el stock al registrar
        la venta.
      </p>
    </aside>
  )
}
