import { useState } from 'react'
import { useLocation } from 'react-router-dom'

import { CreateProductForm } from '../../components/products/CreateProductForm'
import { ProductsTable } from '../../components/products/ProductsTable'
import { Alert } from '../../components/ui/Alert'
import { Button } from '../../components/ui/Button'
import { EmptyState } from '../../components/ui/EmptyState'
import { Modal } from '../../components/ui/Modal'
import { Pagination } from '../../components/ui/Pagination'
import { ReloadButton } from '../../components/ui/ReloadButton'
import { SearchBar } from '../../components/ui/SearchBar'
import { StatusConfirmation } from '../../components/ui/StatusConfirmation'
import { TableSkeleton } from '../../components/ui/TableSkeleton'
import { useAuth } from '../../hooks/useAuth'
import { useCatalogOptions } from '../../hooks/useCatalogOptions'
import { usePagination } from '../../hooks/usePagination'
import { useProducts } from '../../hooks/useProducts'
import { AppLayout } from '../../layouts/AppLayout'
import { productsService } from '../../services/products.service'
import type { Product } from '../../types/product'
import { hasRole } from '../../utils/categories'
import {
  PRODUCT_MANAGE_ROLES,
  productStatusDescription,
  resolveProductError,
} from '../../utils/products'

import './CatalogPage.css'

const SKELETON_ROWS = 8

const ACTIVE_FILTER_VALUES: Record<string, boolean | undefined> = {
  activos: true,
  inactivos: false,
}

const FILTER_DEFAULTS = { categoria: 'todos', unidad: 'todos', estado: 'todos' }

export function ProductsPage() {
  const { user, token } = useAuth()
  const location = useLocation()
  const canManage = hasRole(PRODUCT_MANAGE_ROLES, user?.role.name)
  const filterOptions = useCatalogOptions({ activeOnly: false })

  const {
    page,
    search,
    filters,
    hasFilters,
    params,
    limitOptions,
    setPage,
    setLimit,
    applySearch,
    setFilter,
    clearFilters,
  } = usePagination({ filters: FILTER_DEFAULTS })
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [statusProduct, setStatusProduct] = useState<Product | null>(null)
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null)

  const { status, products, meta, error, refetch } = useProducts({
    ...params,
    categoryId: filters.categoria === 'todos' ? undefined : filters.categoria,
    unitOfMeasureId: filters.unidad === 'todos' ? undefined : filters.unidad,
    active: ACTIVE_FILTER_VALUES[filters.estado],
  })

  const returnTo = `${location.pathname}${location.search}`

  const handleSearch = (term: string) => {
    if (term === search) refetch()
    else applySearch(term)
  }

  const handleOpenCreate = () => {
    setFeedbackMessage(null)
    setIsCreateOpen(true)
  }

  const handleCreated = (product: Product) => {
    setIsCreateOpen(false)
    setFeedbackMessage(
      `El producto ${product.name} (${product.referenceCode}) quedó registrado y activo.`,
    )
    if (page === 1) refetch()
    else setPage(1)
  }

  const handleChangeStatus = async (product: Product) => {
    await productsService.updateStatus(product.id, { active: !product.active }, token)
    setStatusProduct(null)
    setFeedbackMessage(
      `El producto ${product.name} ahora está ${product.active ? 'inactivo' : 'activo'}.`,
    )
    refetch()
  }

  const renderList = () => {
    if (status === 'loading') {
      return <TableSkeleton label="Cargando productos..." rows={SKELETON_ROWS} columns={4} />
    }

    if (status === 'error') {
      return (
        <div className="catalog-page__feedback catalog-page__feedback--inset">
          <Alert tone="error">{error}</Alert>
          <Button variant="outline" onClick={refetch}>
            Reintentar
          </Button>
        </div>
      )
    }

    if (products.length === 0) {
      return hasFilters ? (
        <EmptyState
          variant="sin-resultados"
          title="Ningún producto coincide con los filtros"
          description="Revisa el nombre o el código, o quita los filtros de categoría, unidad y estado."
          onClearFilters={clearFilters}
        />
      ) : (
        <EmptyState
          variant="sin-registros"
          title="Todavía no hay productos en el catálogo"
          description="Un producto se registra una sola vez y luego se asigna a las sedes que lo venden."
        >
          {canManage && <Button onClick={handleOpenCreate}>Registrar producto</Button>}
        </EmptyState>
      )
    }

    return (
      <ProductsTable
        products={products}
        returnTo={returnTo}
        canManage={canManage}
        onToggleStatus={(product) => {
          setFeedbackMessage(null)
          setStatusProduct(product)
        }}
      />
    )
  }

  return (
    <AppLayout title="Productos">
      <div className="catalog-page__toolbar">
        <SearchBar
          id="products-search"
          label="Buscar por nombre o código"
          placeholder="Buscar por nombre o código de referencia"
          value={search}
          onSearch={handleSearch}
        />
        <label className="sr-only" htmlFor="products-category-filter">
          Filtrar por categoría
        </label>
        <select
          id="products-category-filter"
          className="catalog-page__filter"
          value={filters.categoria}
          onChange={(event) => setFilter('categoria', event.target.value)}
        >
          <option value="todos">Todas las categorías</option>
          {filterOptions.categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.active ? category.name : `${category.name} (inactiva)`}
            </option>
          ))}
        </select>
        <label className="sr-only" htmlFor="products-unit-filter">
          Filtrar por unidad de medida
        </label>
        <select
          id="products-unit-filter"
          className="catalog-page__filter"
          value={filters.unidad}
          onChange={(event) => setFilter('unidad', event.target.value)}
        >
          <option value="todos">Todas las unidades</option>
          {filterOptions.units.map((unit) => (
            <option key={unit.id} value={unit.id}>
              {unit.active ? unit.name : `${unit.name} (inactiva)`}
            </option>
          ))}
        </select>
        <label className="sr-only" htmlFor="products-active-filter">
          Filtrar por estado
        </label>
        <select
          id="products-active-filter"
          className="catalog-page__filter"
          value={filters.estado}
          onChange={(event) => setFilter('estado', event.target.value)}
        >
          <option value="todos">Todos los estados</option>
          <option value="activos">Activos</option>
          <option value="inactivos">Inactivos</option>
        </select>
        <ReloadButton onReload={refetch} loading={status === 'loading'} />
        {canManage && (
          <Button className="catalog-page__primary" onClick={handleOpenCreate}>
            Registrar producto
          </Button>
        )}
      </div>

      {feedbackMessage && (
        <div className="catalog-page__feedback">
          <Alert tone="success">{feedbackMessage}</Alert>
        </div>
      )}

      <div className="catalog-page__card">{renderList()}</div>

      <div className="catalog-page__footer">
        {status === 'success' && meta && (
          <Pagination
            page={meta.page}
            totalPages={meta.totalPages}
            total={meta.total}
            limit={params.limit}
            limitOptions={limitOptions}
            label="Paginación de productos"
            onChange={setPage}
            onLimitChange={setLimit}
          />
        )}
        <p className="catalog-page__note">
          Abre un producto para ver todos sus datos, sus imágenes y actualizarlo.
        </p>
      </div>

      <Modal
        open={isCreateOpen}
        title="Registrar producto"
        description="El producto se registra una vez en el catálogo maestro y luego se asigna a las sedes."
        onClose={() => setIsCreateOpen(false)}
      >
        <CreateProductForm onCreated={handleCreated} onCancel={() => setIsCreateOpen(false)} />
      </Modal>

      <Modal
        open={statusProduct !== null}
        title={statusProduct?.active ? '¿Desactivar este producto?' : '¿Activar este producto?'}
        description={statusProduct ? productStatusDescription(statusProduct) : undefined}
        onClose={() => setStatusProduct(null)}
      >
        {statusProduct && (
          <StatusConfirmation
            active={statusProduct.active}
            onConfirm={() => handleChangeStatus(statusProduct)}
            onCancel={() => setStatusProduct(null)}
            resolveError={(error) =>
              resolveProductError(
                error,
                'No fue posible cambiar el estado del producto. Intenta de nuevo.',
              )
            }
          />
        )}
      </Modal>
    </AppLayout>
  )
}
