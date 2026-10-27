import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'

import { PosSelection, type SelectionLine } from '../../components/sales/PosSelection'
import { SellableProductCard } from '../../components/sales/SellableProductCard'
import { Alert } from '../../components/ui/Alert'
import { Button } from '../../components/ui/Button'
import { EmptyState } from '../../components/ui/EmptyState'
import { Pagination } from '../../components/ui/Pagination'
import { ReloadButton } from '../../components/ui/ReloadButton'
import { SearchBar } from '../../components/ui/SearchBar'
import { useAuth } from '../../hooks/useAuth'
import { useCatalogOptions } from '../../hooks/useCatalogOptions'
import { useInventoryBranches } from '../../hooks/useInventoryBranches'
import { usePagination } from '../../hooks/usePagination'
import { useSellableProducts } from '../../hooks/useSellableProducts'
import { AppLayout } from '../../layouts/AppLayout'
import type { SellableProduct } from '../../types/sale'
import { hasRole } from '../../utils/categories'
import { SALE_REGISTER_ROLES } from '../../utils/sales'

import '../inventory/InventoryPage.css'
import '../../components/sales/PointOfSale.css'

const FILTER_DEFAULTS = { sede: '', categoria: 'todos' }
const POS_LIMIT_OPTIONS = [12, 24, 48]

export function PosPage() {
  const { user } = useAuth()
  const canSell = hasRole(SALE_REGISTER_ROLES, user?.role.name)
  const branchOptions = useInventoryBranches()
  const categoryOptions = useCatalogOptions({ activeOnly: true })
  const [, setSearchParams] = useSearchParams()
  const {
    search,
    filters,
    hasFilters,
    params,
    limitOptions,
    setPage,
    setLimit,
    applySearch,
    setFilter,
  } = usePagination({ filters: FILTER_DEFAULTS, defaultLimit: 12, limitOptions: POS_LIMIT_OPTIONS })

  const activeBranches = branchOptions.branches.filter((option) => option.active)
  const branch =
    activeBranches.find((option) => option.id === filters.sede) ?? activeBranches[0] ?? null
  const [selection, setSelection] = useState<{ branchId: string; lines: SelectionLine[] }>({
    branchId: '',
    lines: [],
  })
  const lines = selection.branchId === branch?.id ? selection.lines : []

  const { status, products, meta, error, refetch } = useSellableProducts(branch?.id ?? null, {
    ...params,
    categoryId: filters.categoria === 'todos' ? undefined : filters.categoria,
  })

  const updateLines = (update: (current: SelectionLine[]) => SelectionLine[]) => {
    if (!branch) return
    setSelection({ branchId: branch.id, lines: update(lines) })
  }

  const addProduct = (product: SellableProduct) =>
    updateLines((current) => {
      const existing = current.find((line) => line.product.productId === product.productId)
      if (!existing) return [...current, { product, quantity: 1 }]
      return current.map((line) =>
        line.product.productId === product.productId
          ? { product, quantity: Math.min(line.quantity + 1, product.availableQuantity) }
          : line,
      )
    })

  const changeQuantity = (productId: string, quantity: number) =>
    updateLines((current) =>
      current.map((line) =>
        line.product.productId === productId
          ? { ...line, quantity: Math.max(1, Math.min(quantity, line.product.availableQuantity)) }
          : line,
      ),
    )

  const removeProduct = (productId: string) =>
    updateLines((current) => current.filter((line) => line.product.productId !== productId))

  const handleSearch = (term: string) => {
    if (term === search) refetch()
    else applySearch(term)
  }

  const changeBranch = (branchId: string) =>
    setSearchParams(
      (previous) => {
        const next = new URLSearchParams(previous)
        next.set('sede', branchId)
        next.delete('pagina')
        return next
      },
      { replace: true },
    )

  const renderProducts = () => {
    if (branchOptions.status === 'error') {
      return (
        <div className="inventory-page__feedback">
          <Alert tone="error">No fue posible cargar las sedes. Intenta de nuevo.</Alert>
          <Button variant="outline" onClick={branchOptions.reload}>
            Reintentar
          </Button>
        </div>
      )
    }
    if (status === 'loading' || status === 'idle') {
      return (
        <p className="pos-panel__loading" role="status">
          Cargando productos vendibles...
        </p>
      )
    }
    if (status === 'error') {
      return (
        <div className="inventory-page__feedback">
          <Alert tone="error">{error}</Alert>
          <Button variant="outline" onClick={refetch}>
            Reintentar
          </Button>
        </div>
      )
    }
    if (products.length === 0) {
      return (
        <div className="inventory-page__card">
          {hasFilters ? (
            <EmptyState
              variant="sin-resultados"
              title="Ningún producto vendible coincide"
              description="Revisa el nombre o el código, o cambia la categoría."
              onClearFilters={() =>
                setSearchParams(
                  (previous) => {
                    const next = new URLSearchParams(previous)
                    for (const key of ['q', 'categoria', 'pagina']) next.delete(key)
                    return next
                  },
                  { replace: true },
                )
              }
            />
          ) : (
            <EmptyState
              variant="sin-registros"
              title={`${branch?.name ?? 'La sede'} no tiene productos para vender`}
              description="Solo aparecen los productos activos con unidades vigentes. Registra una entrada desde Movimientos para traer stock."
            />
          )}
        </div>
      )
    }
    return (
      <ul className="pos-grid" aria-label="Productos vendibles">
        {products.map((product) => (
          <SellableProductCard
            key={product.productId}
            product={product}
            inSelection={
              lines.find((line) => line.product.productId === product.productId)?.quantity ?? 0
            }
            canSelect={canSell}
            onAdd={addProduct}
          />
        ))}
      </ul>
    )
  }

  if (branchOptions.status === 'success' && activeBranches.length === 0) {
    return (
      <AppLayout title="Punto de venta">
        <div className="inventory-page__card">
          <EmptyState
            title="No tienes sedes activas asignadas"
            description="Pide al superadmin que te asigne a una sede activa para vender."
          />
        </div>
      </AppLayout>
    )
  }

  return (
    <AppLayout title="Punto de venta">
      <div className="inventory-page__toolbar">
        {activeBranches.length > 1 && (
          <div className="inventory-page__branch">
            <label className="inventory-page__branch-label" htmlFor="pos-branch">
              Sede
            </label>
            <select
              id="pos-branch"
              className="inventory-page__filter inventory-page__filter--branch"
              value={branch?.id ?? ''}
              onChange={(event) => changeBranch(event.target.value)}
            >
              {activeBranches.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.name}
                </option>
              ))}
            </select>
          </div>
        )}
        <SearchBar
          id="pos-search"
          label="Buscar producto por nombre o código"
          placeholder="Buscar por nombre o código"
          value={search}
          onSearch={handleSearch}
        />
        <label className="sr-only" htmlFor="pos-category-filter">
          Filtrar por categoría
        </label>
        <select
          id="pos-category-filter"
          className="inventory-page__filter"
          value={filters.categoria}
          onChange={(event) => setFilter('categoria', event.target.value)}
        >
          <option value="todos">Todas las categorías</option>
          {categoryOptions.categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>
        <ReloadButton onReload={refetch} loading={status === 'loading'} />
      </div>

      {!canSell && (
        <div className="inventory-page__feedback">
          <Alert tone="info">
            Estás consultando los productos vendibles. Las ventas las registran el líder y el
            ayudante de cada sede.
          </Alert>
        </div>
      )}

      <div className={canSell ? 'pos-layout' : undefined}>
        <section
          className="pos-panel"
          aria-label={`Productos vendibles de ${branch?.name ?? 'la sede'}`}
        >
          {renderProducts()}
          {status === 'success' && meta && meta.total > 0 && (
            <Pagination
              page={meta.page}
              totalPages={meta.totalPages}
              total={meta.total}
              limit={params.limit}
              limitOptions={limitOptions}
              label="Paginación de productos vendibles"
              onChange={setPage}
              onLimitChange={setLimit}
            />
          )}
        </section>
        {canSell && (
          <PosSelection
            lines={lines}
            onChangeQuantity={changeQuantity}
            onRemove={removeProduct}
            onClear={() => updateLines(() => [])}
          />
        )}
      </div>
    </AppLayout>
  )
}
