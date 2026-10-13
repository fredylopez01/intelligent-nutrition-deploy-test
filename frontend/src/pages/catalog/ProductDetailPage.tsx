import { Link, useLocation, useParams } from 'react-router-dom'

import { ProductDataForm } from '../../components/products/ProductDataForm'
import { ProductGallery } from '../../components/products/ProductGallery'
import { Alert } from '../../components/ui/Alert'
import { Button } from '../../components/ui/Button'
import { EmptyState } from '../../components/ui/EmptyState'
import { StatusBadge } from '../../components/users/StatusBadge'
import { useAuth } from '../../hooks/useAuth'
import { useProduct } from '../../hooks/useProduct'
import { AppLayout } from '../../layouts/AppLayout'
import { hasRole } from '../../utils/categories'
import { formatDateTime } from '../../utils/format'
import { PRODUCT_MANAGE_ROLES, formatPrice } from '../../utils/products'

import './ProductDetailPage.css'

const BACK_LABEL = 'Volver al listado de productos'

export function ProductDetailPage() {
  const { productId } = useParams()
  const location = useLocation()
  const { user } = useAuth()
  const { status, product, error, refetch } = useProduct(productId)
  const canManage = hasRole(PRODUCT_MANAGE_ROLES, user?.role.name)

  const backTo = (location.state as { from?: string } | null)?.from ?? '/catalogo'

  if (status === 'loading') {
    return (
      <AppLayout title="Producto" backTo={backTo} backLabel={BACK_LABEL}>
        <div className="product-page" aria-busy="true">
          <span className="sr-only">Cargando producto...</span>
          <div className="product-page__profile product-page__profile--skeleton" aria-hidden="true">
            <span className="product-page__skeleton product-page__skeleton--media" />
            <span className="product-page__skeleton product-page__skeleton--line" />
            <span className="product-page__skeleton product-page__skeleton--short" />
          </div>
          <span
            className="product-page__skeleton product-page__skeleton--panel"
            aria-hidden="true"
          />
        </div>
      </AppLayout>
    )
  }

  if (status === 'not-found' || status === 'error' || !product) {
    return (
      <AppLayout title="Producto" backTo={backTo} backLabel={BACK_LABEL}>
        <div className="product-page__missing">
          <EmptyState
            title={
              status === 'not-found' ? 'Este producto no existe' : 'No se pudo cargar el producto'
            }
            description={
              status === 'not-found'
                ? 'Puede que el enlace esté mal escrito o que el producto ya no esté disponible.'
                : (error ?? 'Revisa tu conexión e intenta de nuevo.')
            }
          >
            <div className="product-page__missing-actions">
              {status === 'error' && (
                <Button variant="outline" onClick={refetch}>
                  Reintentar
                </Button>
              )}
              <Link className="product-page__missing-link" to={backTo}>
                Volver al listado
              </Link>
            </div>
          </EmptyState>
        </div>
      </AppLayout>
    )
  }

  return (
    <AppLayout
      title={product.name}
      subtitle={`Código ${product.referenceCode}`}
      backTo={backTo}
      backLabel={BACK_LABEL}
    >
      {!product.active && (
        <div className="product-page__feedback">
          <Alert tone="info">
            Este producto está inactivo: conserva su historial y existencias, pero no se puede
            asignar a sedes ni usar en ventas, compras o reposición nuevas.
          </Alert>
        </div>
      )}

      <div className="product-page">
        <section className="product-page__profile" aria-labelledby="product-profile-name">
          <ProductGallery name={product.name} images={product.images ?? []} />

          <div className="product-page__summary">
            <h2 id="product-profile-name" className="product-page__name">
              {product.name}
            </h2>
            <p className="product-page__reference">{product.referenceCode}</p>
            <StatusBadge status={product.active ? 'activo' : 'inactivo'} />
            <p className="product-page__price">
              {formatPrice(product.price)}
              <span className="product-page__price-unit">
                por {product.unitOfMeasure.name.toLocaleLowerCase('es')}
              </span>
            </p>

            <dl className="product-page__facts">
              <div className="product-page__fact">
                <dt>Categoría</dt>
                <dd>{product.category.name}</dd>
              </div>
              <div className="product-page__fact">
                <dt>Unidad de medida</dt>
                <dd>
                  {product.unitOfMeasure.name} ({product.unitOfMeasure.abbreviation})
                </dd>
              </div>
              {product.createdAt && (
                <div className="product-page__fact">
                  <dt>Registrado</dt>
                  <dd className="product-page__numeric">{formatDateTime(product.createdAt)}</dd>
                </div>
              )}
              {product.updatedAt && (
                <div className="product-page__fact">
                  <dt>Última actualización</dt>
                  <dd className="product-page__numeric">{formatDateTime(product.updatedAt)}</dd>
                </div>
              )}
            </dl>
          </div>
        </section>

        <section className="product-page__panel" aria-labelledby="product-data-title">
          <h2 id="product-data-title" className="product-page__panel-title">
            Datos del producto
          </h2>
          <p className="product-page__panel-text">
            {canManage
              ? 'Pulsa "Editar producto" para cambiar el nombre, la descripción, la categoría, la unidad o el precio. El código de referencia no se puede cambiar.'
              : 'Consulta los datos del producto. Solo el superadmin y el líder de sede pueden editarlo.'}
          </p>
          <ProductDataForm product={product} canEdit={canManage} onSaved={refetch} />
        </section>
      </div>
    </AppLayout>
  )
}
