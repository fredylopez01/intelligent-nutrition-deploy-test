import { useState } from 'react'

import { CreatePaymentMethodForm } from '../../components/payment-methods/CreatePaymentMethodForm'
import { EditPaymentMethodForm } from '../../components/payment-methods/EditPaymentMethodForm'
import { PaymentMethodsTable } from '../../components/payment-methods/PaymentMethodsTable'
import { Alert } from '../../components/ui/Alert'
import { Button } from '../../components/ui/Button'
import { EmptyState } from '../../components/ui/EmptyState'
import { Modal } from '../../components/ui/Modal'
import { Pagination } from '../../components/ui/Pagination'
import { ReloadButton } from '../../components/ui/ReloadButton'
import { SearchBar } from '../../components/ui/SearchBar'
import { StatusConfirmation } from '../../components/ui/StatusConfirmation'
import { TableSkeleton } from '../../components/ui/TableSkeleton'
import { useAuth } from '../../hooks/useAuth'
import { usePagination } from '../../hooks/usePagination'
import { usePaymentMethods } from '../../hooks/usePaymentMethods'
import { AppLayout } from '../../layouts/AppLayout'
import { paymentMethodsService } from '../../services/paymentMethods.service'
import type { PaymentMethod } from '../../types/paymentMethod'
import { hasRole } from '../../utils/categories'
import { PAYMENT_METHOD_MANAGE_ROLES, resolvePaymentMethodError } from '../../utils/paymentMethods'

import '../catalog/CatalogPage.css'

const SKELETON_ROWS = 5

const ACTIVE_FILTER_VALUES: Record<string, boolean | undefined> = {
  activos: true,
  inactivos: false,
}

const FILTER_DEFAULTS = { estado: 'todos' }

export function PaymentMethodsPage() {
  const { user, token } = useAuth()
  const canManage = hasRole(PAYMENT_METHOD_MANAGE_ROLES, user?.role.name)

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
  const [editingMethod, setEditingMethod] = useState<PaymentMethod | null>(null)
  const [statusMethod, setStatusMethod] = useState<PaymentMethod | null>(null)
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null)

  const { status, paymentMethods, meta, error, refetch } = usePaymentMethods({
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

  const handleCreated = (paymentMethod: PaymentMethod) => {
    setIsCreateOpen(false)
    setFeedbackMessage(
      `El método ${paymentMethod.name} (${paymentMethod.code}) quedó registrado y ya se puede usar en el punto de venta.`,
    )
    if (page === 1) refetch()
    else setPage(1)
  }

  const handleUpdated = (paymentMethod: PaymentMethod) => {
    setEditingMethod(null)
    setFeedbackMessage(`El método ${paymentMethod.code} ahora se llama ${paymentMethod.name}.`)
    refetch()
  }

  const handleChangeStatus = async (paymentMethod: PaymentMethod) => {
    await paymentMethodsService.updateStatus(
      paymentMethod.id,
      { active: !paymentMethod.active },
      token,
    )
    setStatusMethod(null)
    setFeedbackMessage(
      paymentMethod.active
        ? `${paymentMethod.name} quedó inactivo: ya no aparece en el punto de venta.`
        : `${paymentMethod.name} quedó activo y vuelve a aparecer en el punto de venta.`,
    )
    refetch()
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
        >
          {canManage && <Button onClick={handleOpenCreate}>Registrar método</Button>}
        </EmptyState>
      )
    }

    return (
      <PaymentMethodsTable
        paymentMethods={paymentMethods}
        canManage={canManage}
        onEdit={(paymentMethod) => {
          setFeedbackMessage(null)
          setEditingMethod(paymentMethod)
        }}
        onToggleStatus={(paymentMethod) => {
          setFeedbackMessage(null)
          setStatusMethod(paymentMethod)
        }}
      />
    )
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
        {canManage && (
          <Button className="catalog-page__primary" onClick={handleOpenCreate}>
            Registrar método
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
            label="Paginación de métodos de pago"
            onChange={setPage}
            onLimitChange={setLimit}
          />
        )}
      </div>

      <Modal
        open={isCreateOpen}
        title="Registrar método de pago"
        description="El código y el nombre no pueden repetirse con otro método."
        onClose={() => setIsCreateOpen(false)}
      >
        <CreatePaymentMethodForm
          onCreated={handleCreated}
          onCancel={() => setIsCreateOpen(false)}
        />
      </Modal>

      <Modal
        open={editingMethod !== null}
        title="Editar método de pago"
        onClose={() => setEditingMethod(null)}
      >
        {editingMethod && (
          <EditPaymentMethodForm
            paymentMethod={editingMethod}
            onUpdated={handleUpdated}
            onCancel={() => setEditingMethod(null)}
          />
        )}
      </Modal>

      <Modal
        open={statusMethod !== null}
        title={
          statusMethod?.active
            ? '¿Desactivar este método de pago?'
            : '¿Activar este método de pago?'
        }
        description={
          statusMethod?.active
            ? `${statusMethod.name} dejará de aparecer en el punto de venta. Las ventas que ya se pagaron con él lo conservan.`
            : `${statusMethod?.name} volverá a aparecer en el punto de venta para cobrar.`
        }
        onClose={() => setStatusMethod(null)}
      >
        {statusMethod && (
          <StatusConfirmation
            active={statusMethod.active}
            onConfirm={() => handleChangeStatus(statusMethod)}
            onCancel={() => setStatusMethod(null)}
            resolveError={(error) =>
              resolvePaymentMethodError(
                error,
                'No fue posible cambiar el estado del método de pago. Intenta de nuevo.',
              )
            }
          />
        )}
      </Modal>
    </AppLayout>
  )
}
