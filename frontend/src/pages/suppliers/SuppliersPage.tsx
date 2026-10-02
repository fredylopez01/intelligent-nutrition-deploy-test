import { useState } from 'react'

import { CreateSupplierForm } from '../../components/suppliers/CreateSupplierForm'
import { EditSupplierForm } from '../../components/suppliers/EditSupplierForm'
import { SuppliersTable } from '../../components/suppliers/SuppliersTable'
import { Alert } from '../../components/ui/Alert'
import { Button } from '../../components/ui/Button'
import { EmptyState } from '../../components/ui/EmptyState'
import { Modal } from '../../components/ui/Modal'
import { useSuppliers } from '../../hooks/useSuppliers'
import { AppLayout } from '../../layouts/AppLayout'
import type { Supplier } from '../../types/supplier'

import './SuppliersPage.css'

const PAGE_SIZE = 10

type ActiveFilter = 'todos' | 'activos' | 'inactivos'

const ACTIVE_FILTER_VALUES: Record<ActiveFilter, boolean | undefined> = {
  todos: undefined,
  activos: true,
  inactivos: false,
}

export function SuppliersPage() {
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [activeFilter, setActiveFilter] = useState<ActiveFilter>('todos')
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null)
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null)

  const { status, suppliers, meta, error, refetch } = useSuppliers({
    page,
    limit: PAGE_SIZE,
    search: search.trim() || undefined,
    active: ACTIVE_FILTER_VALUES[activeFilter],
  })

  const totalPages = meta?.totalPages ?? 0

  const handleSearchChange = (value: string) => {
    setSearch(value)
    setPage(1)
  }

  const handleActiveFilterChange = (value: ActiveFilter) => {
    setActiveFilter(value)
    setPage(1)
  }

  const handleOpenCreate = () => {
    setFeedbackMessage(null)
    setIsCreateOpen(true)
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
      const hasFilters = search.trim() !== '' || activeFilter !== 'todos'
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

    return <SuppliersTable suppliers={suppliers} onEdit={handleOpenEdit} />
  }

  return (
    <AppLayout title="Proveedores">
      <div className="suppliers-page__toolbar">
        <label className="sr-only" htmlFor="suppliers-search">
          Buscar por nombre, correo o documento
        </label>
        <input
          id="suppliers-search"
          type="search"
          className="suppliers-page__search"
          placeholder="Buscar por nombre, correo o documento"
          value={search}
          onChange={(e) => handleSearchChange(e.target.value)}
        />
        <label className="sr-only" htmlFor="suppliers-active-filter">
          Filtrar por estado
        </label>
        <select
          id="suppliers-active-filter"
          className="suppliers-page__filter"
          value={activeFilter}
          onChange={(e) => handleActiveFilterChange(e.target.value as ActiveFilter)}
        >
          <option value="todos">Todos los estados</option>
          <option value="activos">Activos</option>
          <option value="inactivos">Inactivos</option>
        </select>
        <Button onClick={handleOpenCreate}>Registrar proveedor</Button>
      </div>

      {feedbackMessage && (
        <div className="suppliers-page__alert">
          <Alert tone="success">{feedbackMessage}</Alert>
        </div>
      )}

      <div className="suppliers-page__card">{renderList()}</div>

      <div className="suppliers-page__footer">
        {status === 'success' && totalPages > 1 && (
          <nav className="suppliers-page__pagination" aria-label="Paginación de proveedores">
            <Button variant="outline" onClick={() => setPage((p) => p - 1)} disabled={page <= 1}>
              Anterior
            </Button>
            <span className="suppliers-page__page-info">
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
        )}
      </div>

      <Modal open={isCreateOpen} title="Registrar proveedor" onClose={() => setIsCreateOpen(false)}>
        <CreateSupplierForm
          onCreated={handleSupplierCreated}
          onCancel={() => setIsCreateOpen(false)}
        />
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
