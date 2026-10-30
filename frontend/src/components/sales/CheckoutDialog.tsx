import { useState } from 'react'

import { useAuth } from '../../hooks/useAuth'
import { salesService } from '../../services/sales.service'
import type { PaymentMethod } from '../../types/paymentMethod'
import type { Sale } from '../../types/sale'
import { formatPrice } from '../../utils/products'
import {
  centsToAmount,
  resolveSaleError,
  selectionTotalCents,
  stockShortages,
  type StockShortage,
} from '../../utils/sales'
import { Alert } from '../ui/Alert'
import { Button } from '../ui/Button'

import type { SelectionLine } from './PosSelection'

import './PointOfSale.css'

interface CheckoutDialogProps {
  branch: { id: string; name: string }
  lines: SelectionLine[]
  paymentMethod: PaymentMethod
  reference: string
  onCompleted: (sale: Sale) => void
  onStockChanged: () => void
  onCancel: () => void
}

export function CheckoutDialog({
  branch,
  lines,
  paymentMethod,
  reference,
  onCompleted,
  onStockChanged,
  onCancel,
}: CheckoutDialogProps) {
  const { token } = useAuth()
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<{ message: string; shortages: StockShortage[] } | null>(null)
  const totalCents = selectionTotalCents(lines)
  const trimmedReference = reference.trim()

  const confirm = async () => {
    setSubmitting(true)
    setError(null)
    try {
      const sale = await salesService.create(
        {
          branchId: branch.id,
          items: lines.map((line) => ({
            productId: line.product.productId,
            quantity: line.quantity,
          })),
          payments: [
            {
              paymentMethodId: paymentMethod.id,
              amount: centsToAmount(totalCents),
              reference: trimmedReference || null,
            },
          ],
        },
        token,
      )
      onCompleted(sale)
    } catch (caught) {
      const shortages = stockShortages(caught)
      if (shortages.length > 0) onStockChanged()
      setError({
        message: resolveSaleError(caught, 'No fue posible registrar la venta. Intenta de nuevo.'),
        shortages,
      })
      setSubmitting(false)
    }
  }

  return (
    <div className="pos-checkout">
      {error && (
        <Alert tone="error">
          {error.message}
          {error.shortages.length > 0 && (
            <ul className="pos-checkout__shortages">
              {error.shortages.map((shortage) => (
                <li key={shortage.productName}>
                  {shortage.productName}: pediste {shortage.requested}, quedan {shortage.available}.
                </li>
              ))}
            </ul>
          )}
        </Alert>
      )}

      <ul className="pos-checkout__lines" aria-label="Resumen de la venta">
        {lines.map(({ product, quantity }) => (
          <li key={product.productId} className="pos-checkout__line">
            <span className="pos-checkout__name">
              {product.name}
              <span className="pos-checkout__meta">
                {quantity} × {formatPrice(product.price)}
              </span>
            </span>
            <span className="pos-checkout__amount">
              {formatPrice(Number(product.price) * quantity)}
            </span>
          </li>
        ))}
      </ul>

      <dl className="pos-checkout__summary">
        <div>
          <dt>Sede</dt>
          <dd>{branch.name}</dd>
        </div>
        <div>
          <dt>Pago</dt>
          <dd>
            {paymentMethod.name}
            {trimmedReference ? ` · Ref. ${trimmedReference}` : ''}
          </dd>
        </div>
        <div className="pos-checkout__total">
          <dt>Total a cobrar</dt>
          <dd>{formatPrice(totalCents / 100)}</dd>
        </div>
      </dl>

      <p className="pos-selection__note">
        Al confirmar se descuentan las unidades de los lotes que vencen primero y la venta queda
        registrada a tu nombre.
      </p>

      <div className="pos-checkout__actions">
        <Button variant="outline" onClick={onCancel} disabled={submitting}>
          Seguir vendiendo
        </Button>
        <Button onClick={() => void confirm()} disabled={submitting}>
          {submitting ? 'Registrando...' : `Cobrar ${formatPrice(totalCents / 100)}`}
        </Button>
      </div>
    </div>
  )
}
