import type { Supplier } from '../../types/supplier'
import { getSupplierKind, getSupplierName } from '../../utils/suppliers'

import './SupplierDetail.css'

interface SupplierDetailProps {
  supplier: Supplier
}

interface DetailItemProps {
  label: string
  value: string | null | undefined
}

function DetailItem({ label, value }: DetailItemProps) {
  return (
    <div className="supplier-detail__item">
      <dt className="supplier-detail__label">{label}</dt>
      <dd className="supplier-detail__value">{value || '—'}</dd>
    </div>
  )
}

export function SupplierDetail({ supplier }: SupplierDetailProps) {
  const { person } = supplier

  return (
    <div className="supplier-detail">
      <section aria-labelledby="supplier-detail-person">
        <h3 className="supplier-detail__section-title" id="supplier-detail-person">
          Datos de la persona
        </h3>
        <dl className="supplier-detail__grid">
          <DetailItem
            label="Tipo de documento"
            value={person.documentType?.code + ' - ' + person.documentType?.name}
          />
          <DetailItem label="Número de documento" value={person.documentNumber} />
          <div className="supplier-detail__item supplier-detail__item--full">
            <dt className="supplier-detail__label">
              {getSupplierKind(supplier) === 'empresa' ? 'Razón social' : 'Nombre'}
            </dt>
            <dd className="supplier-detail__value">{getSupplierName(supplier)}</dd>
          </div>
          <DetailItem label="Correo electrónico" value={person.email} />
          <DetailItem label="Teléfono" value={person.phone} />
          <div className="supplier-detail__item supplier-detail__item--full">
            <dt className="supplier-detail__label">Dirección</dt>
            <dd className="supplier-detail__value">{person.address || '—'}</dd>
          </div>
          <div className="supplier-detail__item">
            <dt className="supplier-detail__label">Estado</dt>
            <dd className="supplier-detail__value">
              <span className={`ui-status ui-status--${person.active ? 'activo' : 'inactivo'}`}>
                {person.active ? 'Activo' : 'Inactivo'}
              </span>
            </dd>
          </div>
        </dl>
      </section>

      <section aria-labelledby="supplier-detail-supplier">
        <h3 className="supplier-detail__section-title" id="supplier-detail-supplier">
          Datos del proveedor
        </h3>
        <dl className="supplier-detail__grid">
          <div className="supplier-detail__item supplier-detail__item--full">
            <dt className="supplier-detail__label">Nombre comercial</dt>
            <dd className="supplier-detail__value">{supplier.commercialName || '—'}</dd>
          </div>
        </dl>
      </section>
    </div>
  )
}
