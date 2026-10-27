import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'

import { MovementDetail } from '../../components/inventory-movements/MovementDetail'
import { MovementsTable } from '../../components/inventory-movements/MovementsTable'
import { Alert } from '../../components/ui/Alert'
import { Button } from '../../components/ui/Button'
import { EmptyState } from '../../components/ui/EmptyState'
import { Modal } from '../../components/ui/Modal'
import { Pagination } from '../../components/ui/Pagination'
import { ReloadButton } from '../../components/ui/ReloadButton'
import { TableSkeleton } from '../../components/ui/TableSkeleton'
import { useAuth } from '../../hooks/useAuth'
import { useInventoryBranches } from '../../hooks/useInventoryBranches'
import { useInventoryMovements } from '../../hooks/useInventoryMovements'
import { useMovementProductOptions } from '../../hooks/useMovementProductOptions'
import { usePagination } from '../../hooks/usePagination'
import { AppLayout } from '../../layouts/AppLayout'
import type { InventoryMovement, MovementType } from '../../types/inventoryMovement'
import { MOVEMENT_TYPE_OPTIONS } from '../../utils/inventoryMovements'

import './InventoryPage.css'
import './MovementsPage.css'

const SKELETON_ROWS = 8
const ALL_BRANCHES = 'todas'
const FILTER_DEFAULTS = { sede: '', tipo: 'todos', producto: 'todos', desde: '', hasta: '' }
const LIMIT_OPTIONS = [20, 50, 100]

type Dialog = { kind: 'detail'; movement: InventoryMovement }

export function MovementsPage() {
  const { user } = useAuth()
  const roleName = user?.role.name
  const isSuperadmin = roleName === 'SUPERADMIN'
  const branchOptions = useInventoryBranches()

  const [, setSearchParams] = useSearchParams()
  const { filters, params, limitOptions, setPage, setLimit, setFilter } = usePagination({
    filters: FILTER_DEFAULTS,
    defaultLimit: 20,
    limitOptions: LIMIT_OPTIONS,
  })
  const hasListFilters =
    filters.tipo !== 'todos' ||
    filters.producto !== 'todos' ||
    filters.desde !== '' ||
    filters.hasta !== ''

  const updateFilters = (changes: Record<string, string | null>) => {
    setSearchParams(
      (previous) => {
        const next = new URLSearchParams(previous)
        for (const [key, value] of Object.entries(changes)) {
          if (value === null || value === '') next.delete(key)
          else next.set(key, value)
        }
        next.delete('pagina')
        return next
      },
      { replace: true },
    )
  }
  const clearListFilters = () =>
    updateFilters({ tipo: null, producto: null, desde: null, hasta: null })

  const requested = branchOptions.branches.find((option) => option.id === filters.sede)
  const branch = requested ?? (isSuperadmin ? null : (branchOptions.branches[0] ?? null))
  const branchId = branch?.id
  const productOptions = useMovementProductOptions(branchId ?? null)

  const invalidRange = filters.desde !== '' && filters.hasta !== '' && filters.desde > filters.hasta
  const ready = branchOptions.status === 'success' && (isSuperadmin || branch !== null)

  const { status, movements, meta, error, refetch } = useInventoryMovements(
    {
      ...params,
      branchId,
      movementType: filters.tipo === 'todos' ? undefined : (filters.tipo as MovementType),
      productId: filters.producto === 'todos' ? undefined : filters.producto,
      from: filters.desde || undefined,
      to: filters.hasta || undefined,
    },
    ready && !invalidRange,
  )

  const [dialog, setDialog] = useState<Dialog | null>(null)
  const closeDialog = () => setDialog(null)

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

    if (invalidRange) {
      return (
        <div className="inventory-page__feedback inventory-page__feedback--inset">
          <Alert tone="info">La fecha inicial debe ser anterior o igual a la fecha final.</Alert>
        </div>
      )
    }

    if (status === 'loading' || status === 'idle') {
      return <TableSkeleton label="Cargando movimientos..." rows={SKELETON_ROWS} columns={6} />
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

    if (movements.length === 0) {
      return !hasListFilters ? (
        <EmptyState
          variant="sin-registros"
          title={
            branch ? `${branch.name} todavía no tiene movimientos` : 'Todavía no hay movimientos'
          }
          description="Aquí aparecen las entradas, salidas, traslados, ajustes, ventas y recepciones de compra, con su lote y quién los registró."
        />
      ) : (
        <EmptyState
          variant="sin-resultados"
          title="Ningún movimiento coincide con los filtros"
          description="Cambia el tipo, el producto o el rango de fechas."
          onClearFilters={clearListFilters}
        />
      )
    }

    return (
      <MovementsTable
        movements={movements}
        viewedBranchId={branchId}
        onViewDetail={(movement) => setDialog({ kind: 'detail', movement })}
      />
    )
  }

  if (branchOptions.status === 'success' && branchOptions.branches.length === 0) {
    return (
      <AppLayout title="Movimientos">
        <div className="inventory-page__card">
          <EmptyState
            title="No tienes sedes asignadas"
            description="Pide al superadmin que te asigne a una sede para consultar sus movimientos."
          />
        </div>
      </AppLayout>
    )
  }

  return (
    <AppLayout title="Movimientos">
      <div className="movements-page__header">
        <div className="inventory-page__branch">
          <label className="inventory-page__branch-label" htmlFor="movements-branch">
            Sede
          </label>
          <select
            id="movements-branch"
            className="inventory-page__filter inventory-page__filter--branch"
            value={branchId ?? ALL_BRANCHES}
            disabled={branchOptions.status !== 'success'}
            onChange={(event) =>
              updateFilters({
                sede: event.target.value === ALL_BRANCHES ? null : event.target.value,
                producto: null,
              })
            }
          >
            {branchOptions.status === 'loading' && <option value="">Cargando sedes...</option>}
            {isSuperadmin && <option value={ALL_BRANCHES}>Todas las sedes</option>}
            {branchOptions.branches.map((option) => (
              <option key={option.id} value={option.id}>
                {option.active ? option.name : `${option.name} (inactiva)`}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="inventory-page__toolbar movements-page__filters">
        <label className="sr-only" htmlFor="movements-type-filter">
          Filtrar por tipo
        </label>
        <select
          id="movements-type-filter"
          className="inventory-page__filter"
          value={filters.tipo}
          onChange={(event) => setFilter('tipo', event.target.value)}
        >
          <option value="todos">Todos los tipos</option>
          {MOVEMENT_TYPE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <label className="sr-only" htmlFor="movements-product-filter">
          Filtrar por producto
        </label>
        <select
          id="movements-product-filter"
          className="inventory-page__filter movements-page__product-filter"
          value={filters.producto}
          onChange={(event) => setFilter('producto', event.target.value)}
        >
          <option value="todos">Todos los productos</option>
          {productOptions.map((product) => (
            <option key={product.id} value={product.id}>
              {product.name}
            </option>
          ))}
        </select>
        <div className="movements-page__dates">
          <label className="movements-page__date">
            <span>Desde</span>
            <input
              type="date"
              className="inventory-page__filter"
              value={filters.desde}
              max={filters.hasta || undefined}
              onChange={(event) => setFilter('desde', event.target.value)}
            />
          </label>
          <label className="movements-page__date">
            <span>Hasta</span>
            <input
              type="date"
              className="inventory-page__filter"
              value={filters.hasta}
              min={filters.desde || undefined}
              onChange={(event) => setFilter('hasta', event.target.value)}
            />
          </label>
        </div>
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
            label="Paginación de movimientos"
            onChange={setPage}
            onLimitChange={setLimit}
          />
        )}
        <p className="inventory-page__note">
          Del más reciente al más antiguo. Los movimientos no se editan ni se eliminan: una
          corrección se registra como un ajuste. Un traslado aparece en las dos sedes.
        </p>
      </div>

      <Modal open={dialog?.kind === 'detail'} title="Detalle del movimiento" onClose={closeDialog}>
        {dialog?.kind === 'detail' && (
          <MovementDetail
            movement={dialog.movement}
            viewedBranchId={branchId}
            onClose={closeDialog}
          />
        )}
      </Modal>
    </AppLayout>
  )
}
