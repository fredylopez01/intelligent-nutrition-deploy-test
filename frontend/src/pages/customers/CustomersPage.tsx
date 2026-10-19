import { useState } from 'react'
import { useLocation } from 'react-router-dom'

import { CreateCustomerForm } from '../../components/customers/CreateCustomerForm'
import { CustomersTable } from '../../components/customers/CustomersTable'
import { CustomersTableSkeleton } from '../../components/customers/CustomersTableSkeleton'
import { Alert } from '../../components/ui/Alert'
import { Button } from '../../components/ui/Button'
import { EmptyState } from '../../components/ui/EmptyState'
import { Modal } from '../../components/ui/Modal'
import { Pagination } from '../../components/ui/Pagination'
import { ReloadButton } from '../../components/ui/ReloadButton'
import { SearchBar } from '../../components/ui/SearchBar'
import { useCustomers } from '../../hooks/useCustomers'
import { usePagination } from '../../hooks/usePagination'
import { AppLayout } from '../../layouts/AppLayout'
import type { Customer } from '../../types/customer'

import './CustomersPage.css'

const SKELETON_ROWS = 10

const ACTIVE_FILTER_VALUES: Record<string, boolean | undefined> = {
  activos: true,
  inactivos: false,
}

const FILTER_DEFAULTS = { estado: 'todos' }

export function CustomersPage() {
  const location = useLocation()
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
  const [feedback, setFeedback] = useState<string | null>(null)

  const { status, customers, meta, error, refetch } = useCustomers({
    ...params,
    active: ACTIVE_FILTER_VALUES[filters.estado],
  })

  const totalPages = meta?.totalPages ?? 0
  const returnTo = `${location.pathname}${location.search}`

  const handleSearch = (term: string) => {
    if (term === search) refetch()
    else applySearch(term)
  }

  const handleOpenCreate = () => {
    setFeedback(null)
    setIsCreateOpen(true)
  }

  const handleCustomerCreated = (customer: Customer, reusedPerson: boolean) => {
    setIsCreateOpen(false)
    setFeedback(
      reusedPerson
        ? `Cliente creado exitosamente. El documento ya estaba registrado a nombre de ${customer.fullName}, así que se conservaron sus datos guardados.`
        : 'Cliente creado exitosamente.',
    )
    if (page === 1) refetch()
    else setPage(1)
  }

  const renderList = () => {
    if (status === 'loading') return <CustomersTableSkeleton rows={SKELETON_ROWS} />

    if (status === 'error') {
      return (
        <div className="customers-page__feedback">
          <Alert tone="error">{error}</Alert>
          <Button variant="outline" onClick={refetch}>
            Reintentar
          </Button>
        </div>
      )
    }

    if (customers.length === 0) {
      return hasFilters ? (
        <EmptyState
          variant="sin-resultados"
          title="Ningún cliente coincide con los filtros"
          description="Revisa el nombre, la razón social o el documento, o quita el filtro de estado."
          onClearFilters={clearFilters}
        />
      ) : (
        <EmptyState
          variant="sin-registros"
          title="Todavía no hay clientes registrados"
          description="Registra el primer cliente para asociarle sus compras en las sedes."
        >
          <Button onClick={handleOpenCreate}>Registrar cliente</Button>
        </EmptyState>
      )
    }

    return <CustomersTable customers={customers} returnTo={returnTo} />
  }

  return (
    <AppLayout title="Clientes">
      <div className="customers-page__toolbar">
        <div className="customers-page__filters">
          <SearchBar
            id="customers-search"
            label="Buscar por nombre, razón social o documento"
            placeholder="Buscar por nombre, razón social o documento"
            value={search}
            onSearch={handleSearch}
          />

          <label className="sr-only" htmlFor="customers-active-filter">
            Filtrar por estado
          </label>
          <select
            id="customers-active-filter"
            className="customers-page__filter"
            value={filters.estado}
            onChange={(event) => setFilter('estado', event.target.value)}
          >
            <option value="todos">Todos los estados</option>
            <option value="activos">Activos</option>
            <option value="inactivos">Inactivos</option>
          </select>

          <ReloadButton onReload={refetch} loading={status === 'loading'} />
        </div>

        <div className="customers-page__actions">
          <Button onClick={handleOpenCreate}>Registrar cliente</Button>
        </div>
      </div>

      {feedback && (
        <div className="customers-page__alert">
          <Alert tone="success">{feedback}</Alert>
        </div>
      )}

      <div className="customers-page__card">{renderList()}</div>

      <div className="customers-page__footer">
        <p className="customers-page__hint">
          {meta && status === 'success' && meta.total > 0
            ? `${meta.total} ${meta.total === 1 ? 'cliente' : 'clientes'}. Abre uno para ver y actualizar sus datos.`
            : 'Un cliente inactivo conserva su historial, pero no se puede usar en ventas nuevas. Su estado se cambia desde el detalle.'}
        </p>
        {status === 'success' && (
          <Pagination
            page={meta?.page ?? page}
            totalPages={totalPages}
            total={meta?.total}
            limit={params.limit}
            limitOptions={limitOptions}
            label="Paginación de clientes"
            onChange={setPage}
            onLimitChange={setLimit}
          />
        )}
      </div>

      <Modal
        open={isCreateOpen}
        title="Registrar cliente"
        description="Busca primero a la persona para no duplicarla. Si no existe, la registras desde cero."
        onClose={() => setIsCreateOpen(false)}
      >
        <CreateCustomerForm
          onCreated={handleCustomerCreated}
          onCancel={() => setIsCreateOpen(false)}
        />
      </Modal>
    </AppLayout>
  )
}
