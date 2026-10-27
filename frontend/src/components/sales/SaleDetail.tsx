import type { Sale } from '../../types/sale'
import { formatMovementDate } from '../../utils/inventoryMovements'
import { formatPrice } from '../../utils/products'
import { SALE_STATUS_LABELS, SALE_STATUS_TONES } from '../../utils/sales'

import '../users/StatusBadge.css'
import './Sales.css'

interface SaleDetailProps {
  sale: Sale
}

export function SaleDetail({ sale }: SaleDetailProps) {
  const hasAdjustments = Number(sale.discountAmount) > 0 || Number(sale.taxAmount) > 0
  return (
    <div className="sale-detail">
      <div className="sale-detail__head">
        <div>
          <p className="sale-detail__number">{sale.saleNumber}</p>
          <p className="sale-detail__meta">
            {formatMovementDate(sale.saleAt)} · {sale.branch.name} · Vendió {sale.user.fullName}
          </p>
          <p className="sale-detail__meta">
            Cliente: {sale.customer?.fullName ?? 'venta sin cliente identificado'}
          </p>
        </div>
        <span className={`ui-status ui-status--${SALE_STATUS_TONES[sale.status]}`}>
          {SALE_STATUS_LABELS[sale.status]}
        </span>
      </div>

      {sale.status === 'REVERSED' && (
        <div className="sale-detail__reversal">
          <span className="sale-detail__label">
            Reversada{sale.reversedAt ? ` el ${formatMovementDate(sale.reversedAt)}` : ''}
          </span>
          <p>{sale.reversalReason}</p>
        </div>
      )}

      <div className="sale-detail__table-wrap">
        <table className="sale-detail__table">
          <caption className="sr-only">Productos de la venta</caption>
          <thead>
            <tr>
              <th scope="col">Producto</th>
              <th scope="col" className="sales-table__number">
                Cant.
              </th>
              <th scope="col" className="sales-table__number">
                Precio
              </th>
              <th scope="col" className="sales-table__number">
                Total
              </th>
            </tr>
          </thead>
          <tbody>
            {sale.items.map((item) => (
              <tr key={item.productId}>
                <td>
                  <span className="sales-table__number-code sale-detail__product">
                    {item.productName}
                  </span>
                  <span className="sales-table__meta">
                    {item.referenceCode}
                    {Number(item.discountAmount) > 0
                      ? ` · descuento ${formatPrice(item.discountAmount)}`
                      : ''}
                    {Number(item.taxAmount) > 0 ? ` · impuesto ${formatPrice(item.taxAmount)}` : ''}
                  </span>
                </td>
                <td className="sales-table__number">{item.quantity}</td>
                <td className="sales-table__number">{formatPrice(item.unitPrice)}</td>
                <td className="sales-table__number">{formatPrice(item.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="sale-detail__summary">
        <dl className="sale-detail__totals">
          <div>
            <dt>Subtotal</dt>
            <dd>{formatPrice(sale.subtotal)}</dd>
          </div>
          {hasAdjustments && (
            <>
              <div>
                <dt>Descuentos</dt>
                <dd>−{formatPrice(sale.discountAmount)}</dd>
              </div>
              <div>
                <dt>Impuestos</dt>
                <dd>{formatPrice(sale.taxAmount)}</dd>
              </div>
            </>
          )}
          <div className="sale-detail__grand">
            <dt>Total</dt>
            <dd>{formatPrice(sale.total)}</dd>
          </div>
        </dl>
        <div className="sale-detail__payments">
          <span className="sale-detail__label">Pagos</span>
          <ul>
            {sale.payments.map((payment, index) => (
              <li key={`${payment.paymentMethod.id}-${index}`}>
                <span>
                  {payment.paymentMethod.name}
                  {payment.reference ? ` · ref. ${payment.reference}` : ''}
                </span>
                <span className="sales-table__number">{formatPrice(payment.amount)}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  )
}
