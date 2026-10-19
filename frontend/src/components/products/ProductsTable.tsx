import { Link, useNavigate } from 'react-router-dom'

import type { Product } from '../../types/product'
import { formatPrice, productPath } from '../../utils/products'
import { RowActions } from '../ui/RowActions'
import { StatusBadge } from '../users/StatusBadge'

import { ProductThumb } from './ProductThumb'

import './ProductsTable.css'

interface ProductsTableProps {
  products: Product[]
  returnTo: string
  canManage: boolean
  onToggleStatus: (product: Product) => void
}

export function ProductsTable({
  products,
  returnTo,
  canManage,
  onToggleStatus,
}: ProductsTableProps) {
  const navigate = useNavigate()

  return (
    <table className="products-table">
      <caption className="sr-only">Productos del catálogo maestro</caption>
      <thead>
        <tr>
          <th scope="col">Producto</th>
          <th scope="col">Categoría</th>
          <th scope="col">Unidad</th>
          <th scope="col" className="products-table__col-price">
            Precio
          </th>
          <th scope="col" className="products-table__col-status">
            Estado
          </th>
          {canManage && (
            <th scope="col" className="products-table__col-actions">
              <span className="sr-only">Acciones</span>
            </th>
          )}
          <th scope="col" className="products-table__col-open">
            <span className="sr-only">Abrir</span>
          </th>
        </tr>
      </thead>
      <tbody>
        {products.map((product) => {
          const href = productPath(product.id)

          return (
            <tr key={product.id} className="products-table__row">
              <td>
                <Link
                  to={href}
                  state={{ from: returnTo }}
                  className="products-table__identity-link"
                  aria-label={`Ver detalle de ${product.name}`}
                >
                  <ProductThumb
                    imageUrl={product.primaryImageUrl}
                    name={product.name}
                    muted={!product.active}
                  />
                  <span className="products-table__identity">
                    <span className="products-table__name">{product.name}</span>
                    <span className="products-table__reference">{product.referenceCode}</span>
                  </span>
                </Link>
              </td>
              <td className="products-table__cell-muted">{product.category.name}</td>
              <td className="products-table__cell-muted">
                {product.unitOfMeasure.name}
                <span className="products-table__abbreviation">
                  {product.unitOfMeasure.abbreviation}
                </span>
              </td>
              <td className="products-table__col-price">{formatPrice(product.price)}</td>
              <td className="products-table__col-status">
                <StatusBadge status={product.active ? 'activo' : 'inactivo'} />
              </td>
              {canManage && (
                <td className="products-table__col-actions">
                  <RowActions
                    label={`Acciones para ${product.name}`}
                    actions={[
                      {
                        label: 'Ver detalle',
                        onSelect: () => void navigate(href, { state: { from: returnTo } }),
                      },
                      {
                        label: product.active ? 'Desactivar' : 'Activar',
                        tone: product.active ? 'danger' : undefined,
                        onSelect: () => onToggleStatus(product),
                      },
                    ]}
                  />
                </td>
              )}
              <td className="products-table__col-open">
                <Link
                  to={href}
                  state={{ from: returnTo }}
                  className="products-table__open"
                  tabIndex={-1}
                  aria-hidden="true"
                >
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="m9 6 6 6-6 6" />
                  </svg>
                </Link>
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}
