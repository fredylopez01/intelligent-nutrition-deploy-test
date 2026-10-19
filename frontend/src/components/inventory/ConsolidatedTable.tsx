import { Fragment, useState } from 'react'

import type { ConsolidatedItem } from '../../types/inventory'
import { formatQuantity } from '../../utils/inventory'

import { StockStatus } from './StockStatus'

import './ConsolidatedTable.css'

interface ConsolidatedTableProps {
  items: ConsolidatedItem[]
}

export function ConsolidatedTable({ items }: ConsolidatedTableProps) {
  const [expanded, setExpanded] = useState<string[]>([])

  const toggle = (productId: string) =>
    setExpanded((ids) =>
      ids.includes(productId) ? ids.filter((id) => id !== productId) : [...ids, productId],
    )

  return (
    <table className="consolidated-table">
      <caption className="sr-only">Inventario consolidado de todas las sedes</caption>
      <thead>
        <tr>
          <th scope="col" className="consolidated-table__col-toggle">
            <span className="sr-only">Desglose</span>
          </th>
          <th scope="col">Producto</th>
          <th scope="col" className="consolidated-table__col-number">
            Sedes
          </th>
          <th scope="col" className="consolidated-table__col-number">
            Total
          </th>
        </tr>
      </thead>
      <tbody>
        {items.map((item) => {
          const isOpen = expanded.includes(item.product.id)
          const breakdownId = `consolidated-${item.product.id}`
          const lowBranches = item.branches.filter(
            (branch) => branch.quantity < branch.minimumStock || branch.quantity === 0,
          ).length
          return (
            <Fragment key={item.product.id}>
              <tr
                className={`consolidated-table__row${isOpen ? ' consolidated-table__row--open' : ''}`}
              >
                <td className="consolidated-table__col-toggle">
                  <button
                    type="button"
                    className="consolidated-table__toggle"
                    aria-expanded={isOpen}
                    aria-controls={breakdownId}
                    aria-label={`${isOpen ? 'Ocultar' : 'Ver'} el desglose por sede de ${item.product.name}`}
                    onClick={() => toggle(item.product.id)}
                  >
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.7"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <path d="m9 6 6 6-6 6" />
                    </svg>
                  </button>
                </td>
                <td>
                  <span className="consolidated-table__identity">
                    <span className="consolidated-table__name">{item.product.name}</span>
                    <span className="consolidated-table__reference">
                      {item.product.referenceCode}
                    </span>
                  </span>
                </td>
                <td className="consolidated-table__col-number consolidated-table__muted">
                  {item.branches.length}
                  {lowBranches > 0 && (
                    <span className="consolidated-table__alert">{lowBranches} bajo mínimo</span>
                  )}
                </td>
                <td className="consolidated-table__col-number consolidated-table__total">
                  {formatQuantity(item.total)}
                </td>
              </tr>
              {isOpen && (
                <tr id={breakdownId} className="consolidated-table__breakdown">
                  <td colSpan={4}>
                    <table className="consolidated-table__branches">
                      <caption className="sr-only">
                        Desglose por sede de {item.product.name}
                      </caption>
                      <thead>
                        <tr>
                          <th scope="col">Sede</th>
                          <th scope="col" className="consolidated-table__col-number">
                            Existencias
                          </th>
                          <th scope="col" className="consolidated-table__col-number">
                            Stock mínimo
                          </th>
                          <th scope="col" className="consolidated-table__col-status">
                            Estado
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {item.branches.map((branch) => (
                          <tr key={branch.branchId}>
                            <td>{branch.branchName}</td>
                            <td className="consolidated-table__col-number">
                              {formatQuantity(branch.quantity)}
                            </td>
                            <td className="consolidated-table__col-number consolidated-table__muted">
                              {formatQuantity(branch.minimumStock)}
                            </td>
                            <td className="consolidated-table__col-status">
                              <StockStatus
                                totalQuantity={branch.quantity}
                                lowStock={branch.quantity < branch.minimumStock}
                              />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </td>
                </tr>
              )}
            </Fragment>
          )
        })}
      </tbody>
    </table>
  )
}
