import type { SaleSummary } from '../../types/sale'
import { formatMovementDate } from '../../utils/inventoryMovements'
import { formatPrice } from '../../utils/products'
import { SALE_STATUS_LABELS, SALE_STATUS_TONES } from '../../utils/sales'

import '../users/StatusBadge.css'
import './Sales.css'

interface SalesTableProps {
  sales: SaleSummary[]
  showBranch: boolean
  onView: (sale: SaleSummary) => void
}

export function SalesTable({ sales, showBranch, onView }: SalesTableProps) {
  return (
    <table className="sales-table">
      <caption className="sr-only">Ventas registradas, de la más reciente a la más antigua</caption>
      <thead>
        <tr>
          <th scope="col">Venta</th>
          {showBranch && (
            <th scope="col" className="sales-table__col-branch">
              Sede
            </th>
          )}
          <th scope="col" className="sales-table__col-customer">
            Cliente
          </th>
          <th scope="col" className="sales-table__col-seller">
            Vendedor
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
        {sales.map((sale) => (
          <tr key={sale.id}>
            <td>
              <span className="sales-table__number-code">{sale.saleNumber}</span>
              <span className="sales-table__meta">
                {formatMovementDate(sale.saleAt)} ·{' '}
                {sale.itemsCount === 1 ? '1 producto' : `${sale.itemsCount} productos`}
              </span>
            </td>
            {showBranch && (
              <td className="sales-table__col-branch sales-table__muted">{sale.branch.name}</td>
            )}
            <td className="sales-table__col-customer sales-table__muted">
              {sale.customer?.fullName ?? 'Sin cliente'}
            </td>
            <td className="sales-table__col-seller sales-table__muted">{sale.user.fullName}</td>
            <td
              className={`sales-table__number${sale.status === 'REVERSED' ? ' sales-table__number--void' : ''}`}
            >
              {formatPrice(sale.total)}
            </td>
            <td>
              <span className={`ui-status ui-status--${SALE_STATUS_TONES[sale.status]}`}>
                {SALE_STATUS_LABELS[sale.status]}
              </span>
            </td>
            <td className="sales-table__col-actions">
              <button
                type="button"
                className="sales-table__detail"
                aria-label={`Ver la venta ${sale.saleNumber}`}
                onClick={() => onView(sale)}
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
