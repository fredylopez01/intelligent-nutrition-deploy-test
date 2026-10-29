import { useState } from 'react'

import { ConsolidatedTable } from '../../components/inventory/ConsolidatedTable'
import { RestockForm } from '../../components/inventory/RestockForm'
import { Alert } from '../../components/ui/Alert'
import { Button } from '../../components/ui/Button'
import { EmptyState } from '../../components/ui/EmptyState'
import { Modal } from '../../components/ui/Modal'
import { Pagination } from '../../components/ui/Pagination'
import { ReloadButton } from '../../components/ui/ReloadButton'
import { SearchBar } from '../../components/ui/SearchBar'
import { TableSkeleton } from '../../components/ui/TableSkeleton'
import { useCatalogOptions } from '../../hooks/useCatalogOptions'
import { useConsolidatedInventory } from '../../hooks/useConsolidatedInventory'
import { usePagination } from '../../hooks/usePagination'
import { AppLayout } from '../../layouts/AppLayout'
import type { GeneralStockDetail } from '../../types/inventory'
import type { RestockValues } from '../../utils/generalStock'
import { formatQuantity } from '../../utils/inventory'

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

  const [restocking, setRestocking] = useState(false)
  const [feedback, setFeedback] = useState<string | null>(null)

  const handleRestocked = (stock: GeneralStockDetail, values: RestockValues) => {
    setRestocking(false)
    const unit = stock.product.unitOfMeasure.abbreviation
    const verb = values.movementType === 'ADJUSTMENT_ENTRY' ? 'Se agregaron' : 'Se retiraron'
    setFeedback(
      `${verb} ${formatQuantity(Number(values.quantity), unit)} al stock general de ${stock.product.name}. Ahora tiene ${formatQuantity(stock.totalQuantity, unit)}.`,
    )
  }

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
    <AppLayout
      title="Inventario consolidado"
      actions={
        <Button
          variant="outline"
          onClick={() => {
            setFeedback(null)
            setRestocking(true)
          }}
        >
          Ajustar stock general
        </Button>
      }
    >
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

      {feedback && (
        <div className="inventory-page__feedback">
          <Alert tone="success">{feedback}</Alert>
        </div>
      )}

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

      <Modal
        open={restocking}
        title="Ajustar stock general"
        description="Agrega o retira unidades del stock general de un producto. El ajuste queda como movimiento y en la auditoría."
        onClose={() => setRestocking(false)}
      >
        {restocking && (
          <RestockForm onRestocked={handleRestocked} onCancel={() => setRestocking(false)} />
        )}
      </Modal>
    </AppLayout>
  )
}
