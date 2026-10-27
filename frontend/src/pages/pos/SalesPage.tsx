import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'

import { ReverseSaleForm } from '../../components/sales/ReverseSaleForm'
import { SaleDetail } from '../../components/sales/SaleDetail'
import { SalesTable } from '../../components/sales/SalesTable'
import { Alert } from '../../components/ui/Alert'
import { Button } from '../../components/ui/Button'
import { EmptyState } from '../../components/ui/EmptyState'
import { Modal } from '../../components/ui/Modal'
import { Pagination } from '../../components/ui/Pagination'
import { ReloadButton } from '../../components/ui/ReloadButton'
import { SearchBar } from '../../components/ui/SearchBar'
import { TableSkeleton } from '../../components/ui/TableSkeleton'
import { useAuth } from '../../hooks/useAuth'
import { useInventoryBranches } from '../../hooks/useInventoryBranches'
import { usePagination } from '../../hooks/usePagination'
import { useSales } from '../../hooks/useSales'
import { AppLayout } from '../../layouts/AppLayout'
import { salesService } from '../../services/sales.service'
import type { Sale, SaleStatus, SaleSummary } from '../../types/sale'
import { hasRole } from '../../utils/categories'
import { formatPrice } from '../../utils/products'
import { SALE_REVERSE_ROLES, SALE_STATUS_LABELS, resolveSaleError } from '../../utils/sales'

import '../inventory/InventoryPage.css'
import '../inventory/MovementsPage.css'

const ALL_BRANCHES = 'todas'
const FILTER_DEFAULTS = { sede: '', estado: 'todos', desde: '', hasta: '' }
const STATUS_OPTIONS: SaleStatus[] = ['COMPLETED', 'REVERSED']
const LIMIT_OPTIONS = [20, 50, 100]

export function SalesPage() {
  const { user } = useAuth()
  const isSuperadmin = user?.role.name === 'SUPERADMIN'
  const canReverse = hasRole(SALE_REVERSE_ROLES, user?.role.name)
  const branchOptions = useInventoryBranches()
  const [, setSearchParams] = useSearchParams()
  const { search, filters, params, limitOptions, setPage, setLimit, applySearch, setFilter } =
    usePagination({ filters: FILTER_DEFAULTS, defaultLimit: 20, limitOptions: LIMIT_OPTIONS })

  const requested = branchOptions.branches.find((option) => option.id === filters.sede)
  const branch = requested ?? (isSuperadmin ? null : (branchOptions.branches[0] ?? null))
  const invalidRange = filters.desde !== '' && filters.hasta !== '' && filters.desde > filters.hasta
  const hasListFilters =
    search !== '' || filters.estado !== 'todos' || filters.desde !== '' || filters.hasta !== ''

  const { status, sales, meta, error, refetch } = useSales(
    {
      ...params,
      branchId: branch?.id,
      status: filters.estado === 'todos' ? undefined : (filters.estado as SaleStatus),
      from: filters.desde || undefined,
      to: filters.hasta || undefined,
    },
    branchOptions.status === 'success' && (isSuperadmin || branch !== null) && !invalidRange,
  )

  const [viewing, setViewing] = useState<SaleSummary | null>(null)
  const [feedback, setFeedback] = useState<string | null>(null)

  const updateFilters = (changes: Record<string, string | null>) =>
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

  const handleSearch = (term: string) => {
    if (term === search) refetch()
    else applySearch(term)
  }

  const handleReversed = (sale: Sale) => {
    setViewing(null)
    setFeedback(
      `La venta ${sale.saleNumber} quedó reversada y sus unidades volvieron al inventario de ${sale.branch.name}.`,
    )
    refetch()
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
    if (invalidRange) {
      return (
        <div className="inventory-page__feedback inventory-page__feedback--inset">
          <Alert tone="info">La fecha inicial debe ser anterior o igual a la fecha final.</Alert>
        </div>
      )
    }
    if (status === 'loading' || status === 'idle') {
      return <TableSkeleton label="Cargando ventas..." rows={8} columns={5} />
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
    if (sales.length === 0) {
      return hasListFilters ? (
        <EmptyState
          variant="sin-resultados"
          title="Ninguna venta coincide con los filtros"
          description="Revisa el número de venta, el estado o el rango de fechas."
          onClearFilters={() => updateFilters({ q: null, estado: null, desde: null, hasta: null })}
        />
      ) : (
        <EmptyState
          variant="sin-registros"
          title={branch ? `${branch.name} todavía no tiene ventas` : 'Todavía no hay ventas'}
          description="Las ventas registradas en el punto de venta aparecen aquí con su total, sus pagos y su estado."
        />
      )
    }
    return <SalesTable sales={sales} showBranch={!branch} onView={setViewing} />
  }

  if (branchOptions.status === 'success' && branchOptions.branches.length === 0) {
    return (
      <AppLayout title="Ventas">
        <div className="inventory-page__card">
          <EmptyState
            title="No tienes sedes asignadas"
            description="Pide al superadmin que te asigne a una sede para consultar sus ventas."
          />
        </div>
      </AppLayout>
    )
  }

  return (
    <AppLayout title="Ventas">
      <div className="inventory-page__toolbar">
        <div className="inventory-page__branch">
          <label className="inventory-page__branch-label" htmlFor="sales-branch">
            Sede
          </label>
          <select
            id="sales-branch"
            className="inventory-page__filter inventory-page__filter--branch"
            value={branch?.id ?? ALL_BRANCHES}
            disabled={branchOptions.status !== 'success'}
            onChange={(event) =>
              updateFilters({
                sede: event.target.value === ALL_BRANCHES ? null : event.target.value,
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
        <SearchBar
          id="sales-search"
          label="Buscar por número de venta"
          placeholder="Buscar por número, ej. V-20261026"
          value={search}
          onSearch={handleSearch}
        />
      </div>
      <div className="inventory-page__toolbar movements-page__filters">
        <label className="sr-only" htmlFor="sales-status-filter">
          Filtrar por estado
        </label>
        <select
          id="sales-status-filter"
          className="inventory-page__filter"
          value={filters.estado}
          onChange={(event) => setFilter('estado', event.target.value)}
        >
          <option value="todos">Todos los estados</option>
          {STATUS_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {SALE_STATUS_LABELS[option]}
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
              onChange={(event) => setFilter('desde', event.target.value)}
            />
          </label>
          <label className="movements-page__date">
            <span>Hasta</span>
            <input
              type="date"
              className="inventory-page__filter"
              value={filters.hasta}
              onChange={(event) => setFilter('hasta', event.target.value)}
            />
          </label>
        </div>
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
            label="Paginación de ventas"
            onChange={setPage}
            onLimitChange={setLimit}
          />
        )}
      </div>

      <Modal
        open={viewing !== null}
        title={viewing ? `Venta ${viewing.saleNumber}` : 'Venta'}
        size="wide"
        onClose={() => setViewing(null)}
      >
        {viewing && (
          <SaleDialog
            summary={viewing}
            canReverse={canReverse}
            onReversed={handleReversed}
            onClose={() => setViewing(null)}
          />
        )}
      </Modal>
    </AppLayout>
  )
}

interface SaleDialogProps {
  summary: SaleSummary
  canReverse: boolean
  onReversed: (sale: Sale) => void
  onClose: () => void
}

function SaleDialog({ summary, canReverse, onReversed, onClose }: SaleDialogProps) {
  const { token } = useAuth()
  const [result, setResult] = useState<{ sale: Sale | null; error: string | null } | null>(null)
  const [reversing, setReversing] = useState(false)

  useEffect(() => {
    let cancelled = false
    salesService
      .get(summary.id, token)
      .then((sale) => {
        if (!cancelled) setResult({ sale, error: null })
      })
      .catch((error: unknown) => {
        if (cancelled) return
        setResult({
          sale: null,
          error: resolveSaleError(error, 'No fue posible cargar la venta. Intenta de nuevo.'),
        })
      })
    return () => {
      cancelled = true
    }
  }, [summary.id, token])

  if (!result) {
    return (
      <p className="sales-dialog__loading" role="status">
        Cargando la venta {summary.saleNumber}...
      </p>
    )
  }
  if (result.error || !result.sale) {
    return <Alert tone="error">{result.error}</Alert>
  }
  if (reversing) {
    return (
      <ReverseSaleForm
        sale={result.sale}
        onReversed={onReversed}
        onCancel={() => setReversing(false)}
      />
    )
  }
  return (
    <div className="sale-detail">
      <SaleDetail sale={result.sale} />
      <div className="sale-detail__actions">
        <Button variant="outline" onClick={onClose}>
          Cerrar
        </Button>
        {canReverse && result.sale.status === 'COMPLETED' && (
          <Button variant="danger" onClick={() => setReversing(true)}>
            Reversar por {formatPrice(result.sale.total)}
          </Button>
        )}
      </div>
    </div>
  )
}
