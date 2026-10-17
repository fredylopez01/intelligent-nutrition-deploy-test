import { ConsolidatedTable } from '../../components/inventory/ConsolidatedTable'
import { Alert } from '../../components/ui/Alert'
import { Button } from '../../components/ui/Button'
import { EmptyState } from '../../components/ui/EmptyState'
import { Pagination } from '../../components/ui/Pagination'
import { ReloadButton } from '../../components/ui/ReloadButton'
import { SearchBar } from '../../components/ui/SearchBar'
import { TableSkeleton } from '../../components/ui/TableSkeleton'
import { useCatalogOptions } from '../../hooks/useCatalogOptions'
import { useConsolidatedInventory } from '../../hooks/useConsolidatedInventory'
import { usePagination } from '../../hooks/usePagination'
import { AppLayout } from '../../layouts/AppLayout'

import './InventoryPage.css'

const FILTER_DEFAULTS = { categoria: 'todos' }

export function ConsolidatedInventoryPage() {
  const categoryOptions = useCatalogOptions({ activeOnly: false })
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
    clearFilters,
  } = usePagination({ filters: FILTER_DEFAULTS })

  const { status, items, meta, error, refetch } = useConsolidatedInventory({
    ...params,
    categoryId: filters.categoria === 'todos' ? undefined : filters.categoria,
  })

  const handleSearch = (term: string) => {
    if (term === search) refetch()
    else applySearch(term)
  }

  const renderList = () => {
    if (status === 'loading') {
      return <TableSkeleton label="Cargando inventario consolidado..." rows={8} columns={3} />
    }

    if (status === 'error') {
      return (
        <div className="inventory-page__feedback inventory-page__feedback--inset">
          <Alert tone="error">{error}</Alert>
          <Button variant="outline" onClick={refetch}>
            Reintentar
          </Button>
        </div>
      )
    }

    if (items.length === 0) {
      return hasFilters ? (
        <EmptyState
          variant="sin-resultados"
          title="Ningún producto coincide con los filtros"
          description="Revisa el nombre o el código, o quita el filtro de categoría."
          onClearFilters={clearFilters}
        />
      ) : (
        <EmptyState
          variant="sin-registros"
          title="Todavía no hay productos en las sedes"
          description="Aquí verás el total de cada producto en todas las sedes cuando se asigne a alguna."
        />
      )
    }

    return <ConsolidatedTable items={items} />
  }

  return (
    <AppLayout title="Inventario consolidado">
      <div className="inventory-page__toolbar">
        <SearchBar
          id="consolidated-search"
          label="Buscar producto por nombre o código"
          placeholder="Buscar por nombre o código de referencia"
          value={search}
          onSearch={handleSearch}
        />
        <label className="sr-only" htmlFor="consolidated-category-filter">
          Filtrar por categoría
        </label>
        <select
          id="consolidated-category-filter"
          className="inventory-page__filter"
          value={filters.categoria}
          onChange={(event) => setFilter('categoria', event.target.value)}
        >
          <option value="todos">Todas las categorías</option>
          {categoryOptions.categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.active ? category.name : `${category.name} (inactiva)`}
            </option>
          ))}
        </select>
        <ReloadButton onReload={refetch} loading={status === 'loading'} />
      </div>

      <div className="inventory-page__card">{renderList()}</div>

      <div className="inventory-page__footer">
        {status === 'success' && meta && (
          <Pagination
            page={meta.page}
            totalPages={meta.totalPages}
            total={meta.total}
            limit={params.limit}
            limitOptions={limitOptions}
            label="Paginación del inventario consolidado"
            onChange={setPage}
            onLimitChange={setLimit}
          />
        )}
        <p className="inventory-page__note">
          El total es la suma de las existencias de todas las sedes. Abre un producto para ver su
          desglose por sede con el stock mínimo de cada una.
        </p>
      </div>
    </AppLayout>
  )
}
