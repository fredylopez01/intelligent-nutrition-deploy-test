import type { PaymentMethod } from '../../types/paymentMethod'
import { RowActions } from '../ui/RowActions'

import '../users/StatusBadge.css'
import '../categories/CategoriesTable.css'
import './PaymentMethodsTable.css'

interface PaymentMethodsTableProps {
  paymentMethods: PaymentMethod[]
  canManage: boolean
  onEdit: (paymentMethod: PaymentMethod) => void
  onToggleStatus: (paymentMethod: PaymentMethod) => void
}

export function PaymentMethodsTable({
  paymentMethods,
  canManage,
  onEdit,
  onToggleStatus,
}: PaymentMethodsTableProps) {
  return (
    <table className="categories-table units-table payment-methods-table">
      <caption className="sr-only">Métodos de pago disponibles en el punto de venta</caption>
      <thead>
        <tr>
          <th scope="col">Código</th>
          <th scope="col">Nombre</th>
          <th scope="col" className="categories-table__col-status">
            Estado
          </th>
          {canManage && (
            <th scope="col" className="categories-table__col-actions">
              <span className="sr-only">Acciones</span>
            </th>
          )}
        </tr>
      </thead>
      <tbody>
        {paymentMethods.map((paymentMethod) => (
          <tr key={paymentMethod.id}>
            <td className="categories-table__description">
              <span className="units-table__abbreviation">{paymentMethod.code}</span>
            </td>
            <td className="categories-table__name">
              {paymentMethod.name}
              <span className="units-table__abbreviation payment-methods-table__inline-code">
                {paymentMethod.code}
              </span>
            </td>
            <td className="categories-table__col-status">
              <span
                className={`ui-status ui-status--${paymentMethod.active ? 'activo' : 'inactivo'}`}
              >
                {paymentMethod.active ? 'Activo' : 'Inactivo'}
              </span>
            </td>
            {canManage && (
              <td className="categories-table__col-actions">
                <RowActions
                  label={`Acciones para ${paymentMethod.name}`}
                  actions={[
                    { label: 'Editar nombre', onSelect: () => onEdit(paymentMethod) },
                    {
                      label: paymentMethod.active ? 'Desactivar' : 'Activar',
                      tone: paymentMethod.active ? 'danger' : undefined,
                      onSelect: () => onToggleStatus(paymentMethod),
                    },
                  ]}
                />
              </td>
            )}
          </tr>
        ))}
      </tbody>
    </table>
  )
}
