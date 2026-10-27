import type { PurchaseSummary } from '../../types/purchase'
import { formatMovementDate } from '../../utils/inventoryMovements'
import { formatPrice } from '../../utils/products'
import { PURCHASE_STATUS_LABELS, PURCHASE_STATUS_TONES, supplierName } from '../../utils/purchases'

import '../users/StatusBadge.css'
import '../sales/Sales.css'

interface PurchasesTableProps {
  purchases: PurchaseSummary[]
  onView: (purchase: PurchaseSummary) => void
}

export function PurchasesTable({ purchases, onView }: PurchasesTableProps) {
  return (
    <table className="sales-table">
      <caption className="sr-only">Órdenes de compra, de la más reciente a la más antigua</caption>
      <thead>
        <tr>
          <th scope="col">Compra</th>
          <th scope="col" className="sales-table__col-customer">
            Proveedor
          </th>
          <th scope="col" className="sales-table__number">
            Total
          </th>
          <th scope="col">Estado</th>
          <th scope="col" className="sales-table__col-actions">
            <span className="sr-only">Detalle</span>
          </th>
        </tr>
      </thead>
      <tbody>
        {purchases.map((purchase) => (
          <tr key={purchase.id}>
            <td>
              <span className="sales-table__number-code">{purchase.purchaseNumber}</span>
              <span className="sales-table__meta">
                {formatMovementDate(purchase.purchaseAt)} ·{' '}
                {purchase.itemsCount === 1 ? '1 producto' : `${purchase.itemsCount} productos`}
              </span>
            </td>
            <td className="sales-table__col-customer sales-table__muted">
              {supplierName(purchase.supplier)}
            </td>
            <td className="sales-table__number">{formatPrice(purchase.total)}</td>
            <td>
              <span className={`ui-status ui-status--${PURCHASE_STATUS_TONES[purchase.status]}`}>
                {PURCHASE_STATUS_LABELS[purchase.status]}
              </span>
            </td>
            <td className="sales-table__col-actions">
              <button
                type="button"
                className="sales-table__detail"
                aria-label={`Ver la compra ${purchase.purchaseNumber}`}
                onClick={() => onView(purchase)}
              >
                Ver
              </button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
