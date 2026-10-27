import type { Purchase } from '../../types/purchase'
import { formatMovementDate } from '../../utils/inventoryMovements'
import { formatPrice } from '../../utils/products'
import { PURCHASE_STATUS_LABELS, PURCHASE_STATUS_TONES, supplierName } from '../../utils/purchases'

import '../users/StatusBadge.css'
import '../sales/Sales.css'
import './Purchases.css'

interface PurchaseDetailProps {
  purchase: Purchase
}

export function PurchaseDetail({ purchase }: PurchaseDetailProps) {
  const requested = purchase.items.reduce((sum, item) => sum + item.requestedQuantity, 0)
  const received = purchase.items.reduce((sum, item) => sum + item.receivedQuantity, 0)
  return (
    <div className="sale-detail">
      <div className="sale-detail__head">
        <div>
          <p className="sale-detail__number">{purchase.purchaseNumber}</p>
          <p className="sale-detail__meta">
            {supplierName(purchase.supplier)} · {formatMovementDate(purchase.purchaseAt)} · Registró{' '}
            {purchase.user.fullName}
          </p>
          {purchase.observation && <p className="sale-detail__meta">{purchase.observation}</p>}
        </div>
        <span className={`ui-status ui-status--${PURCHASE_STATUS_TONES[purchase.status]}`}>
          {PURCHASE_STATUS_LABELS[purchase.status]}
        </span>
      </div>

      <div className="purchase-progress" aria-label={`Recibido ${received} de ${requested}`}>
        <span className="purchase-progress__text">
          Recibido <strong>{received}</strong> de <strong>{requested}</strong> unidades
        </span>
        <span className="purchase-progress__bar">
          <span
            style={{ width: `${requested === 0 ? 0 : Math.round((received / requested) * 100)}%` }}
          />
        </span>
      </div>

      <div className="sale-detail__table-wrap">
        <table className="sale-detail__table">
          <caption className="sr-only">Productos de la orden de compra</caption>
          <thead>
            <tr>
              <th scope="col">Producto</th>
              <th scope="col" className="sales-table__number">
                Recibido
              </th>
              <th scope="col" className="sales-table__number">
                Costo
              </th>
              <th scope="col" className="sales-table__number">
                Subtotal
              </th>
            </tr>
          </thead>
          <tbody>
            {purchase.items.map((item) => (
              <tr key={item.id}>
                <td>
                  <span className="sales-table__number-code sale-detail__product">
                    {item.productName}
                  </span>
                  <span className="sales-table__meta">
                    {item.referenceCode}
                    {item.observation ? ` · ${item.observation}` : ''}
                  </span>
                </td>
                <td
                  className={`sales-table__number${item.received ? ' purchase-detail__complete' : ''}`}
                >
                  {item.receivedQuantity} / {item.requestedQuantity}
                </td>
                <td className="sales-table__number">{formatPrice(item.unitPrice)}</td>
                <td className="sales-table__number">{formatPrice(item.subtotal)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <dl className="sale-detail__totals purchase-detail__totals">
        <div className="sale-detail__grand">
          <dt>Total de la orden</dt>
          <dd>{formatPrice(purchase.total)}</dd>
        </div>
      </dl>
    </div>
  )
}
