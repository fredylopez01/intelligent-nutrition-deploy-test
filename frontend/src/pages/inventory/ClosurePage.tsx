import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'

import { ClosureCountForm } from '../../components/inventory-closures/ClosureCountForm'
import { ClosureResult } from '../../components/inventory-closures/ClosureResult'
import { ClosuresTable } from '../../components/inventory-closures/ClosuresTable'
import { ClosureStart } from '../../components/inventory-closures/ClosureStart'
import { Alert } from '../../components/ui/Alert'
import { Button } from '../../components/ui/Button'
import { EmptyState } from '../../components/ui/EmptyState'
import { Modal } from '../../components/ui/Modal'
import { Pagination } from '../../components/ui/Pagination'
import { ReloadButton } from '../../components/ui/ReloadButton'
import { TableSkeleton } from '../../components/ui/TableSkeleton'
import { useAuth } from '../../hooks/useAuth'
import { useInventoryBranches } from '../../hooks/useInventoryBranches'
import { useInventoryClosures } from '../../hooks/useInventoryClosures'
import { usePagination } from '../../hooks/usePagination'
import { useTodayClosure } from '../../hooks/useTodayClosure'
import { AppLayout } from '../../layouts/AppLayout'
import { inventoryClosuresService } from '../../services/inventoryClosures.service'
import type { ClosureStatus, ClosureSummary, InventoryClosure } from '../../types/inventoryClosure'
import { hasRole } from '../../utils/categories'
import {
  CLOSURE_COUNT_ROLES,
  CLOSURE_REVIEW_ROLES,
  CLOSURE_STATUS_LABELS,
  formatClosureDay,
  resolveClosureError,
} from '../../utils/inventoryClosures'

import './InventoryPage.css'
import './ClosurePage.css'

const ALL_BRANCHES = 'todas'
const FILTER_DEFAULTS = { sede: '', estado: 'todos', desde: '', hasta: '' }
const STATUS_OPTIONS: ClosureStatus[] = ['PENDING', 'CONFIRMED', 'NOT_CONFIRMED']

export function ClosurePage() {
  const { user } = useAuth()
  const roleName = user?.role.name
  const isSuperadmin = roleName === 'SUPERADMIN'
  const canCount = hasRole(CLOSURE_COUNT_ROLES, roleName)
  const canReview = hasRole(CLOSURE_REVIEW_ROLES, roleName)
  const branchOptions = useInventoryBranches()
  const [, setSearchParams] = useSearchParams()

  const { filters, params, limitOptions, setPage, setLimit, setFilter } = usePagination({
    filters: FILTER_DEFAULTS,
  })
  const requested = branchOptions.branches.find((option) => option.id === filters.sede)
  const branch = requested ?? (isSuperadmin ? null : (branchOptions.branches[0] ?? null))
  const branchId = branch?.id ?? null

  const today = useTodayClosure(canCount ? branchId : null)
  const invalidRange = filters.desde !== '' && filters.hasta !== '' && filters.desde > filters.hasta
  const history = useInventoryClosures(
    {
      ...params,
      branchId: branchId ?? undefined,
      status: filters.estado === 'todos' ? undefined : (filters.estado as ClosureStatus),
      from: filters.desde || undefined,
      to: filters.hasta || undefined,
    },
    branchOptions.status === 'success' && (isSuperadmin || branchId !== null) && !invalidRange,
  )
  const hasHistoryFilters =
    filters.estado !== 'todos' || filters.desde !== '' || filters.hasta !== ''

  const [viewing, setViewing] = useState<ClosureSummary | null>(null)

  const changeBranch = (value: string) => {
    setSearchParams(
      (previous) => {
        const next = new URLSearchParams(previous)
        if (value === ALL_BRANCHES) next.delete('sede')
        else next.set('sede', value)
        next.delete('pagina')
        return next
      },
      { replace: true },
    )
  }

  const clearHistoryFilters = () => {
    setSearchParams(
      (previous) => {
        const next = new URLSearchParams(previous)
        for (const key of ['estado', 'desde', 'hasta', 'pagina']) next.delete(key)
        return next
      },
      { replace: true },
    )
  }

  const handleClosureChange = (closure: InventoryClosure) => {
    today.replace(closure)
    history.refetch()
  }

  const renderToday = () => {
    if (!canCount || !branch) return null
    if (today.status === 'loading' || today.status === 'idle') {
      return (
        <div className="closure-page__today closure-page__loading" role="status">
          Revisando el cierre de hoy...
        </div>
      )
    }
    if (today.status === 'error') {
      return (
        <div className="closure-page__today">
          <Alert tone="error">{today.error}</Alert>
          <Button variant="outline" onClick={today.refetch}>
            Reintentar
          </Button>
        </div>
      )
    }
    if (!today.closure) {
      return (
        <div className="closure-page__today">
          <ClosureStart
            branchId={branch.id}
            branchName={branch.name}
            today={today.today}
            onStarted={handleClosureChange}
          />
        </div>
      )
    }
    if (today.closure.status === 'PENDING') {
      return (
        <section className="closure-page__today" aria-labelledby="closure-count-title">
          <div className="closure-page__section-head">
            <div>
              <p className="closure-card__eyebrow">{formatClosureDay(today.closure.closureDate)}</p>
              <h2 id="closure-count-title" className="closure-card__title">
                Conteo ciego de {branch.name}
              </h2>
            </div>
          </div>
          <ClosureCountForm
            key={today.closure.id}
            closure={today.closure}
            onSaved={handleClosureChange}
            onConfirmed={handleClosureChange}
          />
        </section>
      )
    }
    return (
      <section className="closure-page__today" aria-label="Resultado del cierre de hoy">
        <ClosureResult closure={today.closure} showDifferences={canReview} />
      </section>
    )
  }

  const renderHistory = () => {
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
    if (history.status === 'loading' || history.status === 'idle') {
      return <TableSkeleton label="Cargando cierres..." rows={5} columns={5} />
    }
    if (history.status === 'error') {
      return (
        <div className="inventory-page__feedback inventory-page__feedback--inset">
          <Alert tone="error">{history.error}</Alert>
          <Button variant="outline" onClick={history.refetch}>
            Reintentar
          </Button>
        </div>
      )
    }
    if (history.closures.length === 0) {
      return hasHistoryFilters ? (
        <EmptyState
          variant="sin-resultados"
          title="Ningún cierre coincide con los filtros"
          description="Cambia el estado o el rango de fechas."
          onClearFilters={clearHistoryFilters}
        />
      ) : (
        <EmptyState
          variant="sin-registros"
          title="Todavía no hay cierres"
          description="Cada día la sede cuenta sus lotes y confirma el cierre. Aquí quedan todos los cierres con su resultado."
        />
      )
    }
    return (
      <ClosuresTable
        closures={history.closures}
        showBranch={!branchId}
        showDifferences={canReview}
        onView={setViewing}
      />
    )
  }

  if (branchOptions.status === 'success' && branchOptions.branches.length === 0) {
    return (
      <AppLayout title="Cierre diario">
        <div className="inventory-page__card">
          <EmptyState
            title="No tienes sedes asignadas"
            description="Pide al superadmin que te asigne a una sede para hacer el cierre de inventario."
          />
        </div>
      </AppLayout>
    )
  }

  return (
    <AppLayout title="Cierre diario">
      <div className="inventory-page__toolbar">
        <div className="inventory-page__branch">
          <label className="inventory-page__branch-label" htmlFor="closure-branch">
            Sede
          </label>
          <select
            id="closure-branch"
            className="inventory-page__filter inventory-page__filter--branch"
            value={branchId ?? ALL_BRANCHES}
            disabled={branchOptions.status !== 'success'}
            onChange={(event) => changeBranch(event.target.value)}
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

      {renderToday()}

      <section className="closure-page__history" aria-labelledby="closure-history-title">
        <div className="closure-page__section-head">
          <h2 id="closure-history-title" className="closure-page__history-title">
            Historial de cierres
          </h2>
          <div className="inventory-page__toolbar closure-page__filters">
            <label className="sr-only" htmlFor="closure-status-filter">
              Filtrar por estado
            </label>
            <select
              id="closure-status-filter"
              className="inventory-page__filter"
              value={filters.estado}
              onChange={(event) => setFilter('estado', event.target.value)}
            >
              <option value="todos">Todos los estados</option>
              {STATUS_OPTIONS.map((status) => (
                <option key={status} value={status}>
                  {CLOSURE_STATUS_LABELS[status]}
                </option>
              ))}
            </select>
            <label className="closure-page__date">
              <span>Desde</span>
              <input
                type="date"
                className="inventory-page__filter"
                value={filters.desde}
                onChange={(event) => setFilter('desde', event.target.value)}
              />
            </label>
            <label className="closure-page__date">
              <span>Hasta</span>
              <input
                type="date"
                className="inventory-page__filter"
                value={filters.hasta}
                onChange={(event) => setFilter('hasta', event.target.value)}
              />
            </label>
            <ReloadButton onReload={history.refetch} loading={history.status === 'loading'} />
          </div>
        </div>
        <div className="inventory-page__card">{renderHistory()}</div>
        <div className="inventory-page__footer">
          {history.status === 'success' && history.meta && (
            <Pagination
              page={history.meta.page}
              totalPages={history.meta.totalPages}
              total={history.meta.total}
              limit={params.limit}
              limitOptions={limitOptions}
              label="Paginación de cierres"
              onChange={setPage}
              onLimitChange={setLimit}
            />
          )}
        </div>
      </section>

      <Modal
        open={viewing !== null}
        title={
          viewing
            ? `Cierre del ${formatClosureDay(viewing.closureDate)} · ${viewing.branchName}`
            : 'Cierre'
        }
        size="wide"
        onClose={() => setViewing(null)}
      >
        {viewing && (
          <ClosureDetail
            summary={viewing}
            showDifferences={canReview}
            onClose={() => setViewing(null)}
          />
        )}
      </Modal>
    </AppLayout>
  )
}

interface ClosureDetailProps {
  summary: ClosureSummary
  showDifferences: boolean
  onClose: () => void
}

function ClosureDetail({ summary, showDifferences, onClose }: ClosureDetailProps) {
  const { token } = useAuth()
  const [result, setResult] = useState<{
    closure: InventoryClosure | null
    error: string | null
  } | null>(null)

  useEffect(() => {
    let cancelled = false
    inventoryClosuresService
      .get(summary.id, token)
      .then((closure) => {
        if (!cancelled) setResult({ closure, error: null })
      })
      .catch((error: unknown) => {
        if (cancelled) return
        setResult({
          closure: null,
          error: resolveClosureError(error, 'No fue posible cargar el cierre. Intenta de nuevo.'),
        })
      })
    return () => {
      cancelled = true
    }
  }, [summary.id, token])

  return (
    <div className="closure-page__detail">
      {!result && (
        <p className="closure-page__loading" role="status">
          Cargando el cierre...
        </p>
      )}
      {result?.error && <Alert tone="error">{result.error}</Alert>}
      {result?.closure &&
        (result.closure.status === 'PENDING' ? (
          <Alert tone="info">
            El cierre está en conteo: lleva {result.closure.countedItems} de{' '}
            {result.closure.totalItems} lotes contados. El resultado se ve cuando la sede lo
            confirme.
          </Alert>
        ) : (
          <ClosureResult closure={result.closure} showDifferences={showDifferences} />
        ))}
      <div className="closure-card__actions">
        <Button variant="outline" onClick={onClose}>
          Cerrar
        </Button>
      </div>
    </div>
  )
}
