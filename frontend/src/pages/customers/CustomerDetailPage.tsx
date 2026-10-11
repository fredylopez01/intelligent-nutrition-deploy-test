import { Link, useLocation, useParams } from 'react-router-dom'

import { Alert } from '../../components/ui/Alert'
import { Avatar } from '../../components/ui/Avatar'
import { Button } from '../../components/ui/Button'
import { EmptyState } from '../../components/ui/EmptyState'
import { TextField } from '../../components/ui/TextField'
import { StatusBadge } from '../../components/users/StatusBadge'
import { useCustomer } from '../../hooks/useCustomer'
import { AppLayout } from '../../layouts/AppLayout'
import { CUSTOMER_KIND_LABELS, getCustomerDocument, getCustomerKind } from '../../utils/customers'
import { formatDateTime } from '../../utils/format'

import '../../components/customers/CustomerForm.css'
import './CustomerDetailPage.css'

const BACK_LABEL = 'Volver al listado de clientes'

export function CustomerDetailPage() {
  const { customerId } = useParams()
  const location = useLocation()
  const { status, customer, error, refetch } = useCustomer(customerId)

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

  return (
    <AppLayout
      title={customer.fullName}
      subtitle={
        customer.createdAt ? `Cliente desde el ${formatDateTime(customer.createdAt)}` : undefined
      }
      backTo={backTo}
      backLabel={BACK_LABEL}
    >
      {!customer.active && (
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
          <p className="customer-page__panel-text">Información registrada del cliente.</p>
          <div className="customer-form customer-form--readonly">
            <p className="customer-form__section-title">Identificación</p>
            <div className="customer-form__row">
              <TextField
                id="customer-documentType"
                label="Tipo de documento"
                value={customer.person.documentType.name}
                readOnly
              />
              <TextField
                id="customer-documentNumber"
                label="Número de documento"
                value={customer.person.documentNumber}
                readOnly
              />
            </div>
            {kind === 'empresa' ? (
              <TextField
                id="customer-businessName"
                label="Razón social"
                value={customer.person.businessName ?? ''}
                readOnly
              />
            ) : (
              <div className="customer-form__row">
                <TextField
                  id="customer-firstName"
                  label="Nombres"
                  value={customer.person.firstName ?? ''}
                  readOnly
                />
                <TextField
                  id="customer-lastName"
                  label="Apellidos"
                  value={customer.person.lastName ?? ''}
                  readOnly
                />
              </div>
            )}
            <p className="customer-form__section-title">Contacto</p>
            <TextField
              id="customer-email"
              label="Correo electrónico"
              value={customer.person.email}
              readOnly
            />
            <div className="customer-form__row">
              <TextField
                id="customer-phone"
                label="Teléfono"
                value={customer.person.phone}
                readOnly
              />
              <TextField
                id="customer-address"
                label="Dirección"
                value={customer.person.address}
                readOnly
              />
            </div>
          </div>
        </section>
      </div>
    </AppLayout>
  )
}
