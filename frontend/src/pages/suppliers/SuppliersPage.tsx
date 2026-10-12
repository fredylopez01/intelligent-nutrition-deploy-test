import { useState } from 'react'
import { useLocation } from 'react-router-dom'

import { CreateSupplierForm } from '../../components/suppliers/CreateSupplierForm'
import { SuppliersTable } from '../../components/suppliers/SuppliersTable'
import { Alert } from '../../components/ui/Alert'
import { Button } from '../../components/ui/Button'
import { EmptyState } from '../../components/ui/EmptyState'
import { Modal } from '../../components/ui/Modal'
import { Pagination } from '../../components/ui/Pagination'
import { ReloadButton } from '../../components/ui/ReloadButton'
import { SearchBar } from '../../components/ui/SearchBar'
import { usePagination } from '../../hooks/usePagination'
import { useSuppliers } from '../../hooks/useSuppliers'
import { AppLayout } from '../../layouts/AppLayout'

import './SuppliersPage.css'

const ACTIVE_FILTER_VALUES: Record<string, boolean | undefined> = {
  activos: true,
  inactivos: false,
}

const FILTER_DEFAULTS = { estado: 'todos' }

export function SuppliersPage() {
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
  const location = useLocation()
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null)

  const { status, suppliers, meta, error, refetch } = useSuppliers({
    ...params,
    active: ACTIVE_FILTER_VALUES[filters.estado],
  })

  const totalPages = meta?.totalPages ?? 0
  const returnTo = `${location.pathname}${location.search}`

  const handleSearch = (term: string) => {
    if (term === search) void refetch()
    else applySearch(term)
  }

  const handleOpenCreate = () => {
    setFeedbackMessage(null)
    setIsCreateOpen(true)
  }

  const handleSupplierCreated = () => {
    setIsCreateOpen(false)
    setFeedbackMessage('Proveedor creado exitosamente.')
    if (page === 1) {
      void refetch()
    } else {
      setPage(1)
    }
  }

  const renderList = () => {
    if (status === 'loading') {
      return (
        <div className="suppliers-page__skeleton">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="suppliers-page__skeleton-row" />
          ))}
        </div>
      )
    }

    if (status === 'error') {
      return (
        <div className="suppliers-page__feedback">
          <Alert tone="error">{error}</Alert>
          <Button variant="outline" onClick={() => void refetch()}>
            Reintentar
          </Button>
        </div>
      )
    }

    if (suppliers.length === 0) {
      return hasFilters ? (
        <EmptyState
          variant="sin-resultados"
          title="Ningún proveedor coincide con los filtros"
          description="Prueba con otro término de búsqueda o cambia el filtro de estado."
          onClearFilters={clearFilters}
        />
      ) : (
        <EmptyState
          variant="sin-registros"
          title="Todavía no hay proveedores registrados"
          description="Registra el primer proveedor para comenzar."
        >
          <Button onClick={handleOpenCreate}>Registrar proveedor</Button>
        </EmptyState>
      )
    }

    return <SuppliersTable suppliers={suppliers} returnTo={returnTo} />
  }

  return (
    <AppLayout title="Proveedores">
      <div className="suppliers-page__toolbar">
        <SearchBar
          id="suppliers-search"
          label="Buscar por nombre o documento"
          placeholder="Buscar por nombre, nombre comercial o documento"
          value={search}
          onSearch={handleSearch}
        />
        <label className="sr-only" htmlFor="suppliers-active-filter">
          Filtrar por estado
        </label>
        <select
          id="suppliers-active-filter"
          className="suppliers-page__filter"
          value={filters.estado}
          onChange={(e) => setFilter('estado', e.target.value)}
        >
          <option value="todos">Todos los estados</option>
          <option value="activos">Activos</option>
          <option value="inactivos">Inactivos</option>
        </select>
        <ReloadButton onReload={() => void refetch()} loading={status === 'loading'} />
        <Button onClick={handleOpenCreate}>Registrar proveedor</Button>
      </div>

      {feedbackMessage && (
        <div className="suppliers-page__alert">
          <Alert tone="success">{feedbackMessage}</Alert>
        </div>
      )}

      <div className="suppliers-page__card">{renderList()}</div>

      <div className="suppliers-page__footer">
        {status === 'success' && (
          <Pagination
            page={meta?.page ?? page}
            totalPages={totalPages}
            total={meta?.total}
            limit={params.limit}
            limitOptions={limitOptions}
            label="Paginación de proveedores"
            onChange={setPage}
            onLimitChange={setLimit}
          />
        )}
      </div>

      <Modal
        open={isCreateOpen}
        title="Registrar proveedor"
        description="Busca primero a la persona o empresa para no duplicarla. Si no existe, la registras desde cero."
        onClose={() => setIsCreateOpen(false)}
      >
        <CreateSupplierForm
          onCreated={handleSupplierCreated}
          onCancel={() => setIsCreateOpen(false)}
        />
      </Modal>
    </AppLayout>
  )
}
