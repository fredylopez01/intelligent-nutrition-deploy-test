import { useSearchParams } from 'react-router-dom'

import { ClosureStart } from '../../components/inventory-closures/ClosureStart'
import { Alert } from '../../components/ui/Alert'
import { Button } from '../../components/ui/Button'
import { EmptyState } from '../../components/ui/EmptyState'
import { useAuth } from '../../hooks/useAuth'
import { useInventoryBranches } from '../../hooks/useInventoryBranches'
import { usePagination } from '../../hooks/usePagination'
import { useTodayClosure } from '../../hooks/useTodayClosure'
import { AppLayout } from '../../layouts/AppLayout'
import type { InventoryClosure } from '../../types/inventoryClosure'
import { hasRole } from '../../utils/categories'
import { CLOSURE_COUNT_ROLES, formatClosureDay } from '../../utils/inventoryClosures'

import './InventoryPage.css'
import './ClosurePage.css'

const ALL_BRANCHES = 'todas'
const FILTER_DEFAULTS = { sede: '' }

export function ClosurePage() {
  const { user } = useAuth()
  const roleName = user?.role.name
  const isSuperadmin = roleName === 'SUPERADMIN'
  const canCount = hasRole(CLOSURE_COUNT_ROLES, roleName)
  const branchOptions = useInventoryBranches()
  const [, setSearchParams] = useSearchParams()

  const { filters } = usePagination({ filters: FILTER_DEFAULTS })
  const requested = branchOptions.branches.find((option) => option.id === filters.sede)
  const branch = requested ?? (isSuperadmin ? null : (branchOptions.branches[0] ?? null))
  const branchId = branch?.id ?? null

  const today = useTodayClosure(canCount ? branchId : null)

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

  const handleClosureChange = (closure: InventoryClosure) => {
    today.replace(closure)
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
        <div className="closure-page__today">
          <Alert tone="info">
            El cierre del {formatClosureDay(today.closure.closureDate)} está abierto con{' '}
            {today.closure.totalItems} lotes para contar.
          </Alert>
        </div>
      )
    }
    return (
      <section className="closure-page__today" aria-label="Resultado del cierre de hoy">
        <Alert tone="info">
          El cierre de hoy ya se cerró: los conteos no se pueden cambiar. Si hay una diferencia, el
          superadmin puede registrar un ajuste.
        </Alert>
      </section>
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
    </AppLayout>
  )
}
