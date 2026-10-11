import { useState } from 'react'
import type { FormEvent } from 'react'
import { useLocation, useSearchParams } from 'react-router-dom'

import { CreateCustomerForm } from '../../components/customers/CreateCustomerForm'
import { CustomersTable } from '../../components/customers/CustomersTable'
import { CustomersTableSkeleton } from '../../components/customers/CustomersTableSkeleton'
import { Alert } from '../../components/ui/Alert'
import { Button } from '../../components/ui/Button'
import { EmptyState } from '../../components/ui/EmptyState'
import { Modal } from '../../components/ui/Modal'
import { Pagination } from '../../components/ui/Pagination'
import { useCustomers } from '../../hooks/useCustomers'
import { AppLayout } from '../../layouts/AppLayout'
import type { Customer } from '../../types/customer'

import './CustomersPage.css'

const PAGE_SIZE = 10
const MIN_SEARCH_LENGTH = 2

type ActiveFilter = 'todos' | 'activos' | 'inactivos'

const ACTIVE_FILTER_VALUES: Record<ActiveFilter, boolean | undefined> = {
  todos: undefined,
  activos: true,
  inactivos: false,
}

function parseActiveFilter(value: string | null): ActiveFilter {
  return value === 'activos' || value === 'inactivos' ? value : 'todos'
}

export function CustomersPage() {
  const location = useLocation()
  const [searchParams, setSearchParams] = useSearchParams()

  const page = Math.max(1, Number(searchParams.get('pagina')) || 1)
  const activeFilter = parseActiveFilter(searchParams.get('estado'))
  const appliedSearch = searchParams.get('q') ?? ''

  const [searchDraft, setSearchDraft] = useState(appliedSearch)
  const [searchError, setSearchError] = useState<string | null>(null)
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [feedback, setFeedback] = useState<string | null>(null)

  const { status, customers, meta, error, refetch } = useCustomers({
    page,
    limit: PAGE_SIZE,
    search: appliedSearch || undefined,
    active: ACTIVE_FILTER_VALUES[activeFilter],
  })

  const totalPages = meta?.totalPages ?? 0
  const hasFilters = appliedSearch !== '' || activeFilter !== 'todos'
  const returnTo = `${location.pathname}${location.search}`

  const updateParams = (changes: Record<string, string | null>, resetPage = true) => {
    setSearchParams(
      (previous) => {
        const next = new URLSearchParams(previous)
        for (const [key, value] of Object.entries(changes)) {
          if (value === null || value === '' || value === 'todos') next.delete(key)
          else next.set(key, value)
        }
        if (resetPage) next.delete('pagina')
        return next
      },
      { replace: true },
    )
  }

  const handleSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const term = searchDraft.trim()
    if (term.length > 0 && term.length < MIN_SEARCH_LENGTH) {
      setSearchError(`Escribe al menos ${MIN_SEARCH_LENGTH} caracteres para buscar.`)
      return
    }
    setSearchError(null)
    if (term === appliedSearch) refetch()
    else updateParams({ q: term || null })
  }

  const goToPage = (nextPage: number) => {
    updateParams({ pagina: nextPage > 1 ? String(nextPage) : null }, false)
  }

  const clearFilters = () => {
    setSearchDraft('')
    setSearchError(null)
    updateParams({ q: null, estado: null })
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
    else goToPage(1)
  }

  const renderList = () => {
    if (status === 'loading') return <CustomersTableSkeleton rows={PAGE_SIZE} />

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
          title="Ningún cliente coincide con los filtros"
          description="Revisa el nombre, la razón social o el documento, o quita el filtro de estado."
        >
          <Button variant="outline" onClick={clearFilters}>
            Limpiar filtros
          </Button>
        </EmptyState>
      ) : (
        <EmptyState
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
          <form className="customers-page__search" role="search" onSubmit={handleSearch} noValidate>
            <label className="sr-only" htmlFor="customers-search">
              Buscar por nombre, razón social o documento
            </label>
            <input
              id="customers-search"
              type="search"
              className={`customers-page__search-input${
                searchError ? ' customers-page__search-input--invalid' : ''
              }`}
              placeholder="Buscar por nombre, razón social o documento"
              value={searchDraft}
              aria-invalid={!!searchError}
              aria-describedby={searchError ? 'customers-search-error' : undefined}
              onChange={(event) => {
                setSearchDraft(event.target.value)
                if (searchError) setSearchError(null)
              }}
            />
          </form>

          <label className="sr-only" htmlFor="customers-active-filter">
            Filtrar por estado
          </label>
          <select
            id="customers-active-filter"
            className="customers-page__filter"
            value={activeFilter}
            onChange={(event) => updateParams({ estado: event.target.value })}
          >
            <option value="todos">Todos los estados</option>
            <option value="activos">Activos</option>
            <option value="inactivos">Inactivos</option>
          </select>
        </div>

        <div className="customers-page__actions">
          <Button onClick={handleOpenCreate}>Registrar cliente</Button>
        </div>
      </div>

      {searchError && (
        <p id="customers-search-error" className="customers-page__search-error" role="alert">
          {searchError}
        </p>
      )}

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
            label="Paginación de clientes"
            onChange={goToPage}
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
