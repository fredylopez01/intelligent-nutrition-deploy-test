import type { BranchInventoryItem } from '../../types/inventory'
import { formatQuantity } from '../../utils/inventory'
import { RowActions } from '../ui/RowActions'

import { StockStatus } from './StockStatus'

import './InventoryTable.css'

interface InventoryTableProps {
  items: BranchInventoryItem[]
  showThresholds: boolean
  onViewLots: (item: BranchInventoryItem) => void
  onEditMinimum?: (item: BranchInventoryItem) => void
  onViewAvailability?: (item: BranchInventoryItem) => void
}

export function InventoryTable({
  items,
  showThresholds,
  onViewLots,
  onEditMinimum,
  onViewAvailability,
}: InventoryTableProps) {
  return (
    <table className="inventory-table">
      <caption className="sr-only">Existencias de la sede por producto</caption>
      <thead>
        <tr>
          <th scope="col">Producto</th>
          <th scope="col" className="inventory-table__col-category">
            Categoría
          </th>
          <th scope="col" className="inventory-table__col-number">
            Existencias
          </th>
          {showThresholds && (
            <th scope="col" className="inventory-table__col-number inventory-table__col-minimum">
              Stock mínimo
            </th>
          )}
          <th scope="col" className="inventory-table__col-status">
            Estado
          </th>
          <th scope="col" className="inventory-table__col-actions">
            <span className="sr-only">Acciones</span>
          </th>
        </tr>
      </thead>
      <tbody>
        {items.map((item) => {
          const { product } = item
          const abbreviation = product.unitOfMeasure.abbreviation
          const isLow = item.lowStock === true || item.totalQuantity === 0
          const actions = [
            { label: 'Ver lotes', onSelect: () => onViewLots(item) },
            ...(onEditMinimum
              ? [{ label: 'Editar stock mínimo', onSelect: () => onEditMinimum(item) }]
              : []),
            ...(onViewAvailability
              ? [{ label: 'Ver en otras sedes', onSelect: () => onViewAvailability(item) }]
              : []),
          ]

          return (
            <tr
              key={product.id}
              className={`inventory-table__row${isLow ? ' inventory-table__row--low' : ''}`}
            >
              <td>
                <span className="inventory-table__identity">
                  <span className="inventory-table__name">{product.name}</span>
                  <span className="inventory-table__reference">{product.referenceCode}</span>
                </span>
              </td>
              <td className="inventory-table__col-category inventory-table__muted">
                {product.category.name}
              </td>
              <td className="inventory-table__col-number">
                <span className="inventory-table__quantity">
                  {formatQuantity(item.totalQuantity)}
                </span>
                <span className="inventory-table__unit">{abbreviation}</span>
              </td>
              {showThresholds && (
                <td className="inventory-table__col-number inventory-table__col-minimum inventory-table__muted">
                  {item.minimumStock === undefined ? '—' : formatQuantity(item.minimumStock)}
                </td>
              )}
              <td className="inventory-table__col-status">
                <StockStatus totalQuantity={item.totalQuantity} lowStock={item.lowStock} />
              </td>
              <td className="inventory-table__col-actions">
                <RowActions label={`Acciones para ${product.name}`} actions={actions} />
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}
