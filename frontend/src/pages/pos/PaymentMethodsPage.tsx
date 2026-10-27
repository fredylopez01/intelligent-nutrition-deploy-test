import { PaymentMethodsTable } from '../../components/payment-methods/PaymentMethodsTable'
import { Alert } from '../../components/ui/Alert'
import { Button } from '../../components/ui/Button'
import { EmptyState } from '../../components/ui/EmptyState'
import { Pagination } from '../../components/ui/Pagination'
import { ReloadButton } from '../../components/ui/ReloadButton'
import { SearchBar } from '../../components/ui/SearchBar'
import { TableSkeleton } from '../../components/ui/TableSkeleton'
import { usePagination } from '../../hooks/usePagination'
import { usePaymentMethods } from '../../hooks/usePaymentMethods'
import { AppLayout } from '../../layouts/AppLayout'

import '../catalog/CatalogPage.css'

const SKELETON_ROWS = 5

const ACTIVE_FILTER_VALUES: Record<string, boolean | undefined> = {
  activos: true,
  inactivos: false,
}

const FILTER_DEFAULTS = { estado: 'todos' }

export function PaymentMethodsPage() {
  const {
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

  const { status, paymentMethods, meta, error, refetch } = usePaymentMethods({
    ...params,
    active: ACTIVE_FILTER_VALUES[filters.estado],
  })

  const handleSearch = (term: string) => {
    if (term === search) refetch()
    else applySearch(term)
  }

  const renderList = () => {
    if (status === 'loading') {
      return <TableSkeleton label="Cargando métodos de pago..." rows={SKELETON_ROWS} />
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

    if (paymentMethods.length === 0) {
      return hasFilters ? (
        <EmptyState
          variant="sin-resultados"
          title="Ningún método de pago coincide con los filtros"
          description="Revisa el código o el nombre, o cambia el filtro de estado."
          onClearFilters={clearFilters}
        />
      ) : (
        <EmptyState
          variant="sin-registros"
          title="Todavía no hay métodos de pago"
          description="Sin métodos de pago activos el punto de venta no puede registrar ventas."
        />
      )
    }

    return <PaymentMethodsTable paymentMethods={paymentMethods} />
  }

  return (
    <AppLayout title="Métodos de pago">
      <div className="catalog-page__toolbar">
        <SearchBar
          id="payment-methods-search"
          label="Buscar por código o nombre"
          placeholder="Buscar por código o nombre"
          value={search}
          onSearch={handleSearch}
        />
        <label className="sr-only" htmlFor="payment-methods-active-filter">
          Filtrar por estado
        </label>
        <select
          id="payment-methods-active-filter"
          className="catalog-page__filter"
          value={filters.estado}
          onChange={(event) => setFilter('estado', event.target.value)}
        >
          <option value="todos">Todos los estados</option>
          <option value="activos">Activos</option>
          <option value="inactivos">Inactivos</option>
        </select>
        <ReloadButton onReload={refetch} loading={status === 'loading'} />
      </div>

      <div className="catalog-page__card">{renderList()}</div>

      <div className="catalog-page__footer">
        {status === 'success' && meta && (
          <Pagination
            page={meta.page}
            totalPages={meta.totalPages}
            total={meta.total}
            limit={params.limit}
            limitOptions={limitOptions}
            label="Paginación de métodos de pago"
            onChange={setPage}
            onLimitChange={setLimit}
          />
        )}
      </div>
    </AppLayout>
  )
}
