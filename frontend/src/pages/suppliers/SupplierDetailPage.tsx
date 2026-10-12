import { Link, useLocation, useParams } from 'react-router-dom'

import { SupplierDataForm } from '../../components/suppliers/SupplierDataForm'
import { Avatar } from '../../components/ui/Avatar'
import { Button } from '../../components/ui/Button'
import { EmptyState } from '../../components/ui/EmptyState'
import { StatusBadge } from '../../components/users/StatusBadge'
import { useSupplier } from '../../hooks/useSupplier'
import { AppLayout } from '../../layouts/AppLayout'
import {
  SUPPLIER_KIND_LABELS,
  getSupplierDocument,
  getSupplierKind,
  getSupplierName,
} from '../../utils/suppliers'

import './SupplierDetailPage.css'

const BACK_LABEL = 'Volver al listado de proveedores'

export function SupplierDetailPage() {
  const { supplierId } = useParams()
  const location = useLocation()
  const { status, supplier, error, refetch } = useSupplier(supplierId)

  const backTo = (location.state as { from?: string } | null)?.from ?? '/proveedores'

  if (status === 'loading') {
    return (
      <AppLayout title="Proveedor" backTo={backTo} backLabel={BACK_LABEL}>
        <div className="supplier-page" aria-busy="true">
          <span className="sr-only">Cargando proveedor...</span>
          <div
            className="supplier-page__profile supplier-page__profile--skeleton"
            aria-hidden="true"
          >
            <span className="supplier-page__skeleton supplier-page__skeleton--avatar" />
            <span className="supplier-page__skeleton supplier-page__skeleton--line" />
            <span className="supplier-page__skeleton supplier-page__skeleton--short" />
          </div>
          <span
            className="supplier-page__skeleton supplier-page__skeleton--panel"
            aria-hidden="true"
          />
        </div>
      </AppLayout>
    )
  }

  if (status === 'not-found' || status === 'error' || !supplier) {
    return (
      <AppLayout title="Proveedor" backTo={backTo} backLabel={BACK_LABEL}>
        <div className="supplier-page__missing">
          <EmptyState
            title={
              status === 'not-found' ? 'Este proveedor no existe' : 'No se pudo cargar el proveedor'
            }
            description={
              status === 'not-found'
                ? 'Puede que el enlace esté mal escrito o que el proveedor ya no esté disponible.'
                : (error ?? 'Revisa tu conexión e intenta de nuevo.')
            }
          >
            <div className="supplier-page__missing-actions">
              {status === 'error' && (
                <Button variant="outline" onClick={refetch}>
                  Reintentar
                </Button>
              )}
              <Link className="supplier-page__missing-link" to={backTo}>
                Volver al listado
              </Link>
            </div>
          </EmptyState>
        </div>
      </AppLayout>
    )
  }

  const name = getSupplierName(supplier)
  const { person } = supplier

  return (
    <AppLayout
      title={name}
      subtitle={
        supplier.commercialName ? `Nombre comercial: ${supplier.commercialName}` : undefined
      }
      backTo={backTo}
      backLabel={BACK_LABEL}
    >
      <div className="supplier-page">
        <section className="supplier-page__profile" aria-labelledby="supplier-profile-name">
          <Avatar name={name} size="xl" muted={!person.active} />
          <h2 id="supplier-profile-name" className="supplier-page__name">
            {name}
          </h2>
          <p className="supplier-page__email">{person.email ?? 'Sin correo'}</p>
          <StatusBadge status={person.active ? 'activo' : 'inactivo'} />

          <dl className="supplier-page__facts">
            <div className="supplier-page__fact">
              <dt>Tipo de proveedor</dt>
              <dd>{SUPPLIER_KIND_LABELS[getSupplierKind(supplier)]}</dd>
            </div>
            <div className="supplier-page__fact">
              <dt>Nombre comercial</dt>
              <dd>{supplier.commercialName || '—'}</dd>
            </div>
            <div className="supplier-page__fact">
              <dt>Documento</dt>
              <dd className="supplier-page__numeric">{getSupplierDocument(supplier)}</dd>
            </div>
            <div className="supplier-page__fact">
              <dt>Teléfono</dt>
              <dd className="supplier-page__numeric">{person.phone ?? '—'}</dd>
            </div>
            <div className="supplier-page__fact">
              <dt>Dirección</dt>
              <dd>{person.address ?? '—'}</dd>
            </div>
          </dl>
        </section>

        <section className="supplier-page__panel" aria-labelledby="supplier-data-title">
          <h2 id="supplier-data-title" className="supplier-page__panel-title">
            Datos del proveedor
          </h2>
          <p className="supplier-page__panel-text">
            Pulsa "Actualizar información" para editar. Si esta persona también es cliente o usuario
            del sistema, los cambios de identificación y contacto se reflejan allí.
          </p>
          <SupplierDataForm supplier={supplier} onSaved={refetch} />
        </section>
      </div>
    </AppLayout>
  )
}
