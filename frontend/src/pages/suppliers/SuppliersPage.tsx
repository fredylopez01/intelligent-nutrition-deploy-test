import { useState } from 'react'

import { CreateSupplierForm } from '../../components/suppliers/CreateSupplierForm'
import { EditSupplierForm } from '../../components/suppliers/EditSupplierForm'
import { SupplierDetail } from '../../components/suppliers/SupplierDetail'
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
import type { Supplier } from '../../types/supplier'

import './SuppliersPage.css'

const PAGE_SIZE = 10

const ACTIVE_FILTER_VALUES: Record<string, boolean | undefined> = {
  activos: true,
  inactivos: false,
}

const FILTER_DEFAULTS = { estado: 'todos' }

export function SuppliersPage() {
  const { page, search, filters, hasFilters, setPage, applySearch, setFilter } = usePagination({
    filters: FILTER_DEFAULTS,
  })
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [viewingSupplier, setViewingSupplier] = useState<Supplier | null>(null)
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null)
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null)

  const { status, suppliers, meta, error, refetch } = useSuppliers({
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

  const handleOpenView = (supplier: Supplier) => {
    setFeedbackMessage(null)
    setViewingSupplier(supplier)
  }

  const handleOpenEdit = (supplier: Supplier) => {
    setFeedbackMessage(null)
    setEditingSupplier(supplier)
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

  const handleSupplierUpdated = () => {
    setEditingSupplier(null)
    setFeedbackMessage('Los cambios se guardaron correctamente.')
    void refetch()
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
          title="Ningún proveedor coincide con los filtros"
          description="Prueba con otro término de búsqueda o cambia el filtro de estado."
        />
      ) : (
        <EmptyState
          title="Todavía no hay proveedores registrados"
          description="Registra el primer proveedor para comenzar."
        >
          <Button onClick={handleOpenCreate}>Registrar proveedor</Button>
        </EmptyState>
      )
    }

    return <SuppliersTable suppliers={suppliers} onView={handleOpenView} onEdit={handleOpenEdit} />
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
            label="Paginación de proveedores"
            onChange={setPage}
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

      <Modal
        open={viewingSupplier !== null}
        title="Detalle del proveedor"
        onClose={() => setViewingSupplier(null)}
      >
        {viewingSupplier && <SupplierDetail supplier={viewingSupplier} />}
      </Modal>

      <Modal
        open={editingSupplier !== null}
        title="Editar proveedor"
        onClose={() => setEditingSupplier(null)}
      >
        {editingSupplier && (
          <EditSupplierForm
            supplier={editingSupplier}
            onUpdated={handleSupplierUpdated}
            onCancel={() => setEditingSupplier(null)}
          />
        )}
      </Modal>
    </AppLayout>
  )
}
