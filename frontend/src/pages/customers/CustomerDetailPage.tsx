import { useState } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'

import { CustomerDataForm } from '../../components/customers/CustomerDataForm'
import { CustomerStatusModal } from '../../components/customers/CustomerStatusModal'
import { Alert } from '../../components/ui/Alert'
import { Avatar } from '../../components/ui/Avatar'
import { Button } from '../../components/ui/Button'
import { EmptyState } from '../../components/ui/EmptyState'
import { StatusBadge } from '../../components/users/StatusBadge'
import { useAuth } from '../../hooks/useAuth'
import { useCustomer } from '../../hooks/useCustomer'
import { AppLayout } from '../../layouts/AppLayout'
import type { Customer } from '../../types/customer'
import {
  CUSTOMER_KIND_LABELS,
  canManageCustomerStatus,
  getStatusChangedMessage,
  getCustomerDocument,
  getCustomerKind,
} from '../../utils/customers'
import { formatDateTime } from '../../utils/format'

import './CustomerDetailPage.css'

const BACK_LABEL = 'Volver al listado de clientes'

export function CustomerDetailPage() {
  const { customerId } = useParams()
  const location = useLocation()
  const { user } = useAuth()
  const { status, customer, error, refetch } = useCustomer(customerId)
  const [statusCustomer, setStatusCustomer] = useState<Customer | null>(null)
  const [statusFeedback, setStatusFeedback] = useState<string | null>(null)

  const backTo = (location.state as { from?: string } | null)?.from ?? '/clientes'

  if (status === 'loading') {
    return (
      <AppLayout title="Cliente" backTo={backTo} backLabel={BACK_LABEL}>
        <div className="customer-page" aria-busy="true">
          <span className="sr-only">Cargando cliente...</span>
          <div
            className="customer-page__profile customer-page__profile--skeleton"
            aria-hidden="true"
          >
            <span className="customer-page__skeleton customer-page__skeleton--avatar" />
            <span className="customer-page__skeleton customer-page__skeleton--line" />
            <span className="customer-page__skeleton customer-page__skeleton--short" />
          </div>
          <span
            className="customer-page__skeleton customer-page__skeleton--panel"
            aria-hidden="true"
          />
        </div>
      </AppLayout>
    )
  }

  if (status === 'not-found' || status === 'error' || !customer) {
    return (
      <AppLayout title="Cliente" backTo={backTo} backLabel={BACK_LABEL}>
        <div className="customer-page__missing">
          <EmptyState
            title={
              status === 'not-found' ? 'Este cliente no existe' : 'No se pudo cargar el cliente'
            }
            description={
              status === 'not-found'
                ? 'Puede que el enlace esté mal escrito o que el cliente ya no esté disponible.'
                : (error ?? 'Revisa tu conexión e intenta de nuevo.')
            }
          >
            <div className="customer-page__missing-actions">
              {status === 'error' && (
                <Button variant="outline" onClick={refetch}>
                  Reintentar
                </Button>
              )}
              <Link className="customer-page__missing-link" to={backTo}>
                Volver al listado
              </Link>
            </div>
          </EmptyState>
        </div>
      </AppLayout>
    )
  }

  const kind = getCustomerKind(customer)

  const statusAction = canManageCustomerStatus(user?.role.name) ? (
    <Button
      variant={customer.active ? 'danger' : 'outline'}
      onClick={() => {
        setStatusFeedback(null)
        setStatusCustomer(customer)
      }}
    >
      {customer.active ? 'Desactivar cliente' : 'Activar cliente'}
    </Button>
  ) : null

  const handleStatusChanged = (changed: Customer, active: boolean) => {
    setStatusCustomer(null)
    setStatusFeedback(getStatusChangedMessage(changed.fullName, active))
    refetch()
  }

  return (
    <AppLayout
      title={customer.fullName}
      subtitle={
        customer.createdAt ? `Cliente desde el ${formatDateTime(customer.createdAt)}` : undefined
      }
      backTo={backTo}
      backLabel={BACK_LABEL}
      actions={statusAction}
    >
      {statusFeedback && (
        <div className="customer-page__feedback">
          <Alert tone="success">{statusFeedback}</Alert>
        </div>
      )}

      {!customer.active && !statusFeedback && (
        <div className="customer-page__feedback">
          <Alert tone="info">
            Este cliente está inactivo: conserva su historial, pero no se puede usar en ventas
            nuevas.
          </Alert>
        </div>
      )}

      <div className="customer-page">
        <section className="customer-page__profile" aria-labelledby="customer-profile-name">
          <Avatar name={customer.fullName} size="xl" muted={!customer.active} />
          <h2 id="customer-profile-name" className="customer-page__name">
            {customer.fullName}
          </h2>
          <p className="customer-page__email">{customer.person.email}</p>
          <StatusBadge status={customer.active ? 'activo' : 'inactivo'} />

          <dl className="customer-page__facts">
            <div className="customer-page__fact">
              <dt>Tipo de cliente</dt>
              <dd>{CUSTOMER_KIND_LABELS[kind]}</dd>
            </div>
            <div className="customer-page__fact">
              <dt>Documento</dt>
              <dd className="customer-page__numeric">{getCustomerDocument(customer)}</dd>
            </div>
            <div className="customer-page__fact">
              <dt>Teléfono</dt>
              <dd className="customer-page__numeric">{customer.person.phone}</dd>
            </div>
            <div className="customer-page__fact">
              <dt>Dirección</dt>
              <dd>{customer.person.address}</dd>
            </div>
            {customer.updatedAt && (
              <div className="customer-page__fact">
                <dt>Última actualización</dt>
                <dd className="customer-page__numeric">{formatDateTime(customer.updatedAt)}</dd>
              </div>
            )}
          </dl>
        </section>

        <section className="customer-page__panel" aria-labelledby="customer-data-title">
          <h2 id="customer-data-title" className="customer-page__panel-title">
            Datos del cliente
          </h2>
          <p className="customer-page__panel-text">
            Pulsa "Actualizar información" para editar. Si esta persona también es proveedor o
            usuario del sistema, los cambios de contacto se reflejan allí.
          </p>
          <CustomerDataForm customer={customer} onSaved={refetch} />
        </section>
      </div>

      <CustomerStatusModal
        customer={statusCustomer}
        onClose={() => setStatusCustomer(null)}
        onChanged={handleStatusChanged}
      />
    </AppLayout>
  )
}
