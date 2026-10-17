import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'

import { InventoryLots } from '../../components/inventory/InventoryLots'
import { InventoryTable } from '../../components/inventory/InventoryTable'
import { Alert } from '../../components/ui/Alert'
import { Button } from '../../components/ui/Button'
import { EmptyState } from '../../components/ui/EmptyState'
import { Modal } from '../../components/ui/Modal'
import { Pagination } from '../../components/ui/Pagination'
import { ReloadButton } from '../../components/ui/ReloadButton'
import { SearchBar } from '../../components/ui/SearchBar'
import { TableSkeleton } from '../../components/ui/TableSkeleton'
import { useAuth } from '../../hooks/useAuth'
import { useBranchInventory } from '../../hooks/useBranchInventory'
import { useCatalogOptions } from '../../hooks/useCatalogOptions'
import { useInventoryBranches } from '../../hooks/useInventoryBranches'
import { usePagination } from '../../hooks/usePagination'
import { AppLayout } from '../../layouts/AppLayout'
import type { BranchInventoryItem } from '../../types/inventory'
import { hasRole } from '../../utils/categories'
import { INVENTORY_MANAGE_ROLES } from '../../utils/inventory'

import './InventoryPage.css'

const BRANCH_PARAM = 'sede'
const SKELETON_ROWS = 8

const LOW_STOCK_FILTER_VALUES: Record<string, boolean | undefined> = {
  'bajo-minimo': true,
  'en-nivel': false,
}

const FILTER_DEFAULTS = { categoria: 'todos', stock: 'todos' }

type Dialog = { kind: 'lots'; item: BranchInventoryItem }

export function InventoryPage() {
  const { user } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const canManage = hasRole(INVENTORY_MANAGE_ROLES, user?.role.name)
  const branchOptions = useInventoryBranches()
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

  const requestedBranchId = searchParams.get(BRANCH_PARAM)
  const branch =
    branchOptions.branches.find((option) => option.id === requestedBranchId) ??
    branchOptions.branches.find((option) => option.active) ??
    branchOptions.branches[0] ??
    null

  const [dialog, setDialog] = useState<Dialog | null>(null)

  const { status, items, meta, error, refetch } = useBranchInventory(branch?.id ?? null, {
    ...params,
    categoryId: filters.categoria === 'todos' ? undefined : filters.categoria,
    lowStock: canManage ? LOW_STOCK_FILTER_VALUES[filters.stock] : undefined,
  })

  const closeDialog = () => setDialog(null)

  const openDialog = (next: Dialog) => setDialog(next)

  const changeBranch = (branchId: string) => {
    setSearchParams(
      (previous) => {
        const next = new URLSearchParams(previous)
        next.set(BRANCH_PARAM, branchId)
        next.delete('pagina')
        return next
      },
      { replace: true },
    )
  }

  const handleSearch = (term: string) => {
    if (term === search) refetch()
    else applySearch(term)
  }

  const renderList = () => {
    if (branchOptions.status === 'error') {
      return (
        <div className="inventory-page__feedback inventory-page__feedback--inset">
          <Alert tone="error">No fue posible cargar las sedes. Intenta de nuevo.</Alert>
          <Button variant="outline" onClick={branchOptions.reload}>
            Reintentar
          </Button>
        </div>
      )
    }

    if (status === 'loading' || status === 'idle') {
      return <TableSkeleton label="Cargando inventario..." rows={SKELETON_ROWS} columns={4} />
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
          description="Revisa el nombre o el código, o quita los filtros de categoría y stock."
          onClearFilters={clearFilters}
        />
      ) : (
        <EmptyState
          variant="sin-registros"
          title={`${branch?.name ?? 'Esta sede'} todavía no tiene productos`}
          description="Cuando se asigne un producto a la sede, aquí verás sus existencias y su stock mínimo."
        />
      )
    }

    return (
      <InventoryTable
        items={items}
        showThresholds={canManage}
        onViewLots={(item) => openDialog({ kind: 'lots', item })}
      />
    )
  }

  if (branchOptions.status === 'success' && branchOptions.branches.length === 0) {
    return (
      <AppLayout title="Inventario">
        <div className="inventory-page__card">
          <EmptyState
            title="No tienes sedes asignadas"
            description="Pide al superadmin que te asigne a una sede para consultar su inventario."
          />
        </div>
      </AppLayout>
    )
  }

  return (
    <AppLayout title="Inventario">
      <div className="inventory-page__toolbar">
        <div className="inventory-page__branch">
          <label className="inventory-page__branch-label" htmlFor="inventory-branch">
            Sede
          </label>
          <select
            id="inventory-branch"
            className="inventory-page__filter inventory-page__filter--branch"
            value={branch?.id ?? ''}
            disabled={branchOptions.status !== 'success'}
            onChange={(event) => changeBranch(event.target.value)}
          >
            {branchOptions.status === 'loading' && <option value="">Cargando sedes...</option>}
            {branchOptions.status === 'error' && <option value="">Sin sedes</option>}
            {branchOptions.branches.map((option) => (
              <option key={option.id} value={option.id}>
                {option.active ? option.name : `${option.name} (inactiva)`}
              </option>
            ))}
          </select>
        </div>
        <SearchBar
          id="inventory-search"
          label="Buscar producto por nombre o código"
          placeholder="Buscar por nombre o código de referencia"
          value={search}
          onSearch={handleSearch}
        />
        <label className="sr-only" htmlFor="inventory-category-filter">
          Filtrar por categoría
        </label>
        <select
          id="inventory-category-filter"
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
        {canManage && (
          <>
            <label className="sr-only" htmlFor="inventory-stock-filter">
              Filtrar por nivel de stock
            </label>
            <select
              id="inventory-stock-filter"
              className="inventory-page__filter"
              value={filters.stock}
              onChange={(event) => setFilter('stock', event.target.value)}
            >
              <option value="todos">Todo el stock</option>
              <option value="bajo-minimo">Bajo mínimo</option>
              <option value="en-nivel">En nivel</option>
            </select>
          </>
        )}
        <ReloadButton onReload={refetch} loading={status === 'loading'} />
      </div>

      {branch && !branch.active && (
        <div className="inventory-page__feedback">
          <Alert tone="info">
            {branch.name} está inactiva: puedes consultar su inventario, pero no asignar productos
            ni cambiar el stock mínimo.
          </Alert>
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
            label="Paginación del inventario"
            onChange={setPage}
            onLimitChange={setLimit}
          />
        )}
        <p className="inventory-page__note">
          Una fila por producto activo con la suma de todos sus lotes.{' '}
          {canManage
            ? 'Se resaltan los productos agotados o por debajo de su stock mínimo.'
            : 'Se resaltan los productos agotados.'}
        </p>
      </div>

      <Modal
        open={dialog?.kind === 'lots'}
        title={dialog?.kind === 'lots' ? dialog.item.product.name : 'Lotes'}
        description={`Lotes en ${branch?.name ?? 'la sede'}, del más próximo a vencer al más lejano.`}
        onClose={closeDialog}
      >
        {dialog?.kind === 'lots' && branch && (
          <InventoryLots branchId={branch.id} item={dialog.item} onClose={closeDialog} />
        )}
      </Modal>
    </AppLayout>
  )
}
