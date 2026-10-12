import { useState } from 'react'

import { BranchesTable } from '../../components/branches/BranchesTable'
import { BranchesTableSkeleton } from '../../components/branches/BranchesTableSkeleton'
import { BranchStatusConfirmation } from '../../components/branches/BranchStatusConfirmation'
import { CreateBranchForm } from '../../components/branches/CreateBranchForm'
import { EditBranchForm } from '../../components/branches/EditBranchForm'
import { Alert } from '../../components/ui/Alert'
import { Button } from '../../components/ui/Button'
import { EmptyState } from '../../components/ui/EmptyState'
import { Modal } from '../../components/ui/Modal'
import { Pagination } from '../../components/ui/Pagination'
import { ReloadButton } from '../../components/ui/ReloadButton'
import { SearchBar } from '../../components/ui/SearchBar'
import { useBranches } from '../../hooks/useBranches'
import { usePagination } from '../../hooks/usePagination'
import { AppLayout } from '../../layouts/AppLayout'
import type { Branch } from '../../types/branch'

import './BranchesPage.css'

const PAGE_SIZE = 10

const ACTIVE_FILTER_VALUES: Record<string, boolean | undefined> = {
  activas: true,
  inactivas: false,
}

const FILTER_DEFAULTS = { estado: 'todos' }

export function BranchesPage() {
  const { page, search, filters, hasFilters, setPage, applySearch, setFilter, clearFilters } =
    usePagination({ filters: FILTER_DEFAULTS })
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [editingBranch, setEditingBranch] = useState<Branch | null>(null)
  const [statusBranch, setStatusBranch] = useState<Branch | null>(null)
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null)

  const { status, branches, meta, emptyMessage, error, refetch } = useBranches({
    page,
    limit: PAGE_SIZE,
    search: search || undefined,
    active: ACTIVE_FILTER_VALUES[filters.estado],
  })

  const totalPages = meta?.totalPages ?? 0

  const handleSearch = (term: string) => {
    if (term === search) void refetch()
    else applySearch(term)
  }

  const handleOpenCreate = () => {
    setFeedbackMessage(null)
    setIsCreateOpen(true)
  }

  const handleBranchCreated = () => {
    setIsCreateOpen(false)
    setFeedbackMessage('Sede creada exitosamente.')
    if (page === 1) {
      void refetch()
    } else {
      setPage(1)
    }
  }

  const handleBranchUpdated = () => {
    setEditingBranch(null)
    setFeedbackMessage('Los cambios se guardaron correctamente.')
    void refetch()
  }

  const handleBranchStatusChanged = (updatedBranch: Branch) => {
    setStatusBranch(null)
    setFeedbackMessage(
      `La sede ${updatedBranch.name} ahora está ${updatedBranch.active ? 'activa' : 'inactiva'}.`,
    )
    void refetch()
  }

  const renderList = () => {
    if (status === 'loading') return <BranchesTableSkeleton rows={PAGE_SIZE} />

    if (status === 'error') {
      return (
        <div className="branches-page__feedback">
          <Alert tone="error">{error}</Alert>
          <Button variant="outline" onClick={() => void refetch()}>
            Reintentar
          </Button>
        </div>
      )
    }

    if (branches.length === 0) {
      return hasFilters ? (
        <EmptyState
          variant="sin-resultados"
          title="Ninguna sede coincide con la búsqueda"
          description="Revisa el nombre o cambia el filtro de estado."
          onClearFilters={clearFilters}
        />
      ) : (
        <EmptyState
          variant="sin-registros"
          title="Todavía no hay sedes registradas"
          description={emptyMessage ?? 'Registra la primera sede para empezar a operar.'}
        >
          <Button onClick={handleOpenCreate}>Registrar sede</Button>
        </EmptyState>
      )
    }

    return (
      <BranchesTable
        branches={branches}
        onEdit={(branch) => {
          setFeedbackMessage(null)
          setEditingBranch(branch)
        }}
        onToggleStatus={(branch) => {
          setFeedbackMessage(null)
          setStatusBranch(branch)
        }}
      />
    )
  }

  return (
    <AppLayout title="Sedes">
      <div className="branches-page__toolbar">
        <SearchBar
          id="branches-search"
          label="Buscar por nombre"
          placeholder="Buscar por nombre"
          value={search}
          onSearch={handleSearch}
        />
        <label className="sr-only" htmlFor="branches-active-filter">
          Filtrar por estado
        </label>
        <select
          id="branches-active-filter"
          className="branches-page__filter"
          value={filters.estado}
          onChange={(event) => setFilter('estado', event.target.value)}
        >
          <option value="todos">Todos los estados</option>
          <option value="activas">Activas</option>
          <option value="inactivas">Inactivas</option>
        </select>
        <ReloadButton onReload={() => void refetch()} loading={status === 'loading'} />
        <Button onClick={handleOpenCreate}>Registrar sede</Button>
      </div>

      {feedbackMessage && (
        <div className="branches-page__feedback">
          <Alert tone="success">{feedbackMessage}</Alert>
        </div>
      )}

      <div className="branches-page__card">{renderList()}</div>

      {status === 'success' && totalPages > 1 && (
        <div className="branches-page__footer">
          <Pagination
            page={meta?.page ?? page}
            totalPages={totalPages}
            label="Paginación de sedes"
            onChange={setPage}
          />
        </div>
      )}

      <Modal open={isCreateOpen} title="Registrar sede" onClose={() => setIsCreateOpen(false)}>
        <CreateBranchForm onCreated={handleBranchCreated} onCancel={() => setIsCreateOpen(false)} />
      </Modal>

      <Modal
        open={editingBranch !== null}
        title="Editar sede"
        onClose={() => setEditingBranch(null)}
      >
        {editingBranch && (
          <EditBranchForm
            branch={editingBranch}
            onUpdated={handleBranchUpdated}
            onCancel={() => setEditingBranch(null)}
          />
        )}
      </Modal>

      <Modal
        open={statusBranch !== null}
        title={statusBranch?.active ? '¿Desactivar esta sede?' : '¿Activar esta sede?'}
        description={
          statusBranch?.active
            ? `${statusBranch.name} quedará inactiva y no estará disponible para la operación.`
            : `${statusBranch?.name} volverá a estar disponible para la operación.`
        }
        onClose={() => setStatusBranch(null)}
      >
        {statusBranch && (
          <BranchStatusConfirmation
            branch={statusBranch}
            onChanged={handleBranchStatusChanged}
            onCancel={() => setStatusBranch(null)}
          />
        )}
      </Modal>
    </AppLayout>
  )
}
