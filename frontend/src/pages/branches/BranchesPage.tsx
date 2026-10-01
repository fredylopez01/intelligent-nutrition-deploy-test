import { useEffect, useState } from 'react'

import { BranchesTable } from '../../components/branches/BranchesTable'
import { BranchesTableSkeleton } from '../../components/branches/BranchesTableSkeleton'
import { CreateBranchForm } from '../../components/branches/CreateBranchForm'
import { Alert } from '../../components/ui/Alert'
import { Button } from '../../components/ui/Button'
import { EmptyState } from '../../components/ui/EmptyState'
import { Modal } from '../../components/ui/Modal'
import { useBranches } from '../../hooks/useBranches'
import { AppLayout } from '../../layouts/AppLayout'

import './BranchesPage.css'

const PAGE_SIZE = 10

type ActiveFilter = 'todos' | 'activas' | 'inactivas'

const ACTIVE_FILTER_VALUES: Record<ActiveFilter, boolean | undefined> = {
  todos: undefined,
  activas: true,
  inactivas: false,
}

export function BranchesPage() {
  const [page, setPage] = useState(1)
  const [activeFilter, setActiveFilter] = useState<ActiveFilter>('todos')
  const [search, setSearch] = useState('')
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [createdMessage, setCreatedMessage] = useState<string | null>(null)

  const { status, branches, meta, emptyMessage, error, refetch } = useBranches({
    page,
    limit: PAGE_SIZE,
    search: search.trim() || undefined,
    active: ACTIVE_FILTER_VALUES[activeFilter],
  })

  const totalPages = meta?.totalPages ?? 0
  const hasFilters = search.trim() !== '' || activeFilter !== 'todos'

  useEffect(() => {
    if (!createdMessage) return

    const hideTimer = window.setTimeout(() => {
      setCreatedMessage(null)
    }, 4000)

    return () => {
      window.clearTimeout(hideTimer)
    }
  }, [createdMessage])

  const handleOpenCreate = () => {
    setCreatedMessage(null)
    setIsCreateOpen(true)
  }

  const handleBranchCreated = () => {
    setIsCreateOpen(false)
    setCreatedMessage('Sede creada exitosamente.')
    if (page === 1) {
      void refetch()
    } else {
      setPage(1)
    }
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
      return (
        <EmptyState
          title={
            hasFilters
              ? 'Ninguna sede coincide con la búsqueda'
              : 'Todavía no hay sedes registradas'
          }
          description={
            hasFilters
              ? 'Revisa el nombre o cambia el filtro de estado.'
              : (emptyMessage ?? 'Registra la primera sede para empezar a operar.')
          }
        />
      )
    }

    return <BranchesTable branches={branches} />
  }

  return (
    <AppLayout title="Sedes">
      <div className="branches-page__toolbar">
        <label className="sr-only" htmlFor="branches-search">
          Buscar por nombre
        </label>
        <input
          id="branches-search"
          type="search"
          className="branches-page__search"
          placeholder="Buscar por nombre"
          value={search}
          onChange={(event) => {
            setSearch(event.target.value)
            setPage(1)
          }}
        />
        <label className="sr-only" htmlFor="branches-active-filter">
          Filtrar por estado
        </label>
        <select
          id="branches-active-filter"
          className="branches-page__filter"
          value={activeFilter}
          onChange={(event) => {
            setActiveFilter(event.target.value as ActiveFilter)
            setPage(1)
          }}
        >
          <option value="todos">Todos los estados</option>
          <option value="activas">Activas</option>
          <option value="inactivas">Inactivas</option>
        </select>
        <Button onClick={handleOpenCreate}>Registrar sede</Button>
      </div>

      {createdMessage && (
        <div className="branches-page__feedback">
          <Alert tone="success">{createdMessage}</Alert>
        </div>
      )}

      <div className="branches-page__card">{renderList()}</div>

      {status === 'success' && totalPages > 1 && (
        <div className="branches-page__footer">
          <nav className="branches-page__pagination" aria-label="Paginación de sedes">
            <Button variant="outline" onClick={() => setPage((p) => p - 1)} disabled={page <= 1}>
              Anterior
            </Button>
            <span className="branches-page__page-info">
              Página {meta?.page ?? page} de {totalPages}
            </span>
            <Button
              variant="outline"
              onClick={() => setPage((p) => p + 1)}
              disabled={page >= totalPages}
            >
              Siguiente
            </Button>
          </nav>
        </div>
      )}

      <Modal open={isCreateOpen} title="Registrar sede" onClose={() => setIsCreateOpen(false)}>
        <CreateBranchForm onCreated={handleBranchCreated} onCancel={() => setIsCreateOpen(false)} />
      </Modal>
    </AppLayout>
  )
}
