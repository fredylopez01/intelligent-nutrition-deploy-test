import { useState } from 'react'

import { Alert } from '../../components/ui/Alert'
import { Button } from '../../components/ui/Button'
import { EmptyState } from '../../components/ui/EmptyState'
import { Modal } from '../../components/ui/Modal'
import { Pagination } from '../../components/ui/Pagination'
import { ReloadButton } from '../../components/ui/ReloadButton'
import { SearchBar } from '../../components/ui/SearchBar'
import { StatusConfirmation } from '../../components/ui/StatusConfirmation'
import { TableSkeleton } from '../../components/ui/TableSkeleton'
import { CreateUnitForm } from '../../components/units/CreateUnitForm'
import { EditUnitForm } from '../../components/units/EditUnitForm'
import { UnitsTable } from '../../components/units/UnitsTable'
import { useAuth } from '../../hooks/useAuth'
import { usePagination } from '../../hooks/usePagination'
import { useUnits } from '../../hooks/useUnits'
import { AppLayout } from '../../layouts/AppLayout'
import { unitsService } from '../../services/units.service'
import type { UnitOfMeasure } from '../../types/unit'
import { hasRole } from '../../utils/categories'
import { UNIT_MANAGE_ROLES, resolveUnitError } from '../../utils/units'

import './CatalogPage.css'

const SKELETON_ROWS = 8

const ACTIVE_FILTER_VALUES: Record<string, boolean | undefined> = {
  activas: true,
  inactivas: false,
}

const FILTER_DEFAULTS = { estado: 'todos' }

export function UnitsPage() {
  const { user, token } = useAuth()
  const canManage = hasRole(UNIT_MANAGE_ROLES, user?.role.name)

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
  const [editingUnit, setEditingUnit] = useState<UnitOfMeasure | null>(null)
  const [statusUnit, setStatusUnit] = useState<UnitOfMeasure | null>(null)
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null)

  const { status, units, meta, error, refetch } = useUnits({
    ...params,
    active: ACTIVE_FILTER_VALUES[filters.estado],
  })

  const handleSearch = (term: string) => {
    if (term === search) refetch()
    else applySearch(term)
  }

  const handleOpenCreate = () => {
    setFeedbackMessage(null)
    setIsCreateOpen(true)
  }

  const handleCreated = (unit: UnitOfMeasure) => {
    setIsCreateOpen(false)
    setFeedbackMessage(`La unidad ${unit.name} (${unit.abbreviation}) quedó registrada y activa.`)
    if (page === 1) refetch()
    else setPage(1)
  }

  const handleUpdated = (unit: UnitOfMeasure) => {
    setEditingUnit(null)
    setFeedbackMessage(`Los cambios de la unidad ${unit.name} (${unit.abbreviation}) se guardaron.`)
    refetch()
  }

  const handleChangeStatus = async (unit: UnitOfMeasure) => {
    await unitsService.updateStatus(unit.id, { active: !unit.active }, token)
    setStatusUnit(null)
    setFeedbackMessage(`La unidad ${unit.name} ahora está ${unit.active ? 'inactiva' : 'activa'}.`)
    refetch()
  }

  const renderList = () => {
    if (status === 'loading') {
      return <TableSkeleton label="Cargando unidades de medida..." rows={SKELETON_ROWS} />
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

    if (units.length === 0) {
      return hasFilters ? (
        <EmptyState
          variant="sin-resultados"
          title="Ninguna unidad coincide con los filtros"
          description="Revisa el nombre o cambia el filtro de estado."
          onClearFilters={clearFilters}
        />
      ) : (
        <EmptyState
          variant="sin-registros"
          title="Todavía no hay unidades de medida"
          description="Las unidades indican cómo se vende cada producto, por ejemplo Kilogramo (kg) o Unidad (und)."
        >
          {canManage && <Button onClick={handleOpenCreate}>Registrar unidad</Button>}
        </EmptyState>
      )
    }

    return (
      <UnitsTable
        units={units}
        canManage={canManage}
        onEdit={(unit) => {
          setFeedbackMessage(null)
          setEditingUnit(unit)
        }}
        onToggleStatus={(unit) => {
          setFeedbackMessage(null)
          setStatusUnit(unit)
        }}
      />
    )
  }

  return (
    <AppLayout title="Unidades de medida">
      <div className="catalog-page__toolbar">
        <SearchBar
          id="units-search"
          label="Buscar por nombre"
          placeholder="Buscar por nombre"
          value={search}
          onSearch={handleSearch}
        />
        <label className="sr-only" htmlFor="units-active-filter">
          Filtrar por estado
        </label>
        <select
          id="units-active-filter"
          className="catalog-page__filter"
          value={filters.estado}
          onChange={(event) => setFilter('estado', event.target.value)}
        >
          <option value="todos">Todos los estados</option>
          <option value="activas">Activas</option>
          <option value="inactivas">Inactivas</option>
        </select>
        <ReloadButton onReload={refetch} loading={status === 'loading'} />
        {canManage && (
          <Button className="catalog-page__primary" onClick={handleOpenCreate}>
            Registrar unidad
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
            label="Paginación de unidades de medida"
            onChange={setPage}
            onLimitChange={setLimit}
          />
        )}
      </div>

      <Modal
        open={isCreateOpen}
        title="Registrar unidad de medida"
        description="Define cómo se mide o se vende un producto. El nombre y la abreviatura no pueden repetirse."
        onClose={() => setIsCreateOpen(false)}
      >
        <CreateUnitForm onCreated={handleCreated} onCancel={() => setIsCreateOpen(false)} />
      </Modal>

      <Modal
        open={editingUnit !== null}
        title="Editar unidad de medida"
        onClose={() => setEditingUnit(null)}
      >
        {editingUnit && (
          <EditUnitForm
            unit={editingUnit}
            onUpdated={handleUpdated}
            onCancel={() => setEditingUnit(null)}
          />
        )}
      </Modal>

      <Modal
        open={statusUnit !== null}
        title={statusUnit?.active ? '¿Desactivar esta unidad?' : '¿Activar esta unidad?'}
        description={
          statusUnit?.active
            ? `${statusUnit.name} (${statusUnit.abbreviation}) no se podrá asignar a productos nuevos. Los productos que ya la usan la conservan.`
            : `${statusUnit?.name} volverá a estar disponible para asignarla a productos.`
        }
        onClose={() => setStatusUnit(null)}
      >
        {statusUnit && (
          <StatusConfirmation
            active={statusUnit.active}
            onConfirm={() => handleChangeStatus(statusUnit)}
            onCancel={() => setStatusUnit(null)}
            resolveError={(error) =>
              resolveUnitError(
                error,
                'No fue posible cambiar el estado de la unidad. Intenta de nuevo.',
              )
            }
          />
        )}
      </Modal>
    </AppLayout>
  )
}
