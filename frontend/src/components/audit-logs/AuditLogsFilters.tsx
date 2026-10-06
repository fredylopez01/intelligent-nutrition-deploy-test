import { SelectField } from '../ui/SelectField'

import './AuditLogsFilters.css'

import type { User } from '../../types/user'

const ACTION_OPTIONS = [
  { value: 'CREATE', label: 'Creación' },
  { value: 'UPDATE', label: 'Actualización' },
  { value: 'ACTIVATE', label: 'Activación' },
  { value: 'DEACTIVATE', label: 'Desactivación' },
  { value: 'ASSIGN', label: 'Asignación' },
  { value: 'UNASSIGN', label: 'Desasignación' },
  { value: 'PASSWORD_RESET', label: 'Restablecimiento de contraseña' },
  { value: 'ROLE_ASSIGNMENT', label: 'Asignación de rol' },
  { value: 'INVENTORY_ADJUSTMENT', label: 'Ajuste de inventario' },
  { value: 'INVENTORY_TRANSFER', label: 'Transferencia de inventario' },
  { value: 'SALE_REVERSAL', label: 'Reversión de venta' },
]

interface AuditLogsFiltersProps {
  users: User[]
  userId: string
  action: string
  fromDate: string
  toDate: string
  onUserIdChange: (value: string) => void
  onActionChange: (value: string) => void
  onFromDateChange: (value: string) => void
  onToDateChange: (value: string) => void
}

export function AuditLogsFilters({
  users,
  userId,
  action,
  fromDate,
  toDate,
  onUserIdChange,
  onActionChange,
  onFromDateChange,
  onToDateChange,
}: AuditLogsFiltersProps) {
  const userOptions = users.map((user) => {
    const first = user.person.firstName ?? ''
    const last = user.person.lastName ?? ''
    const fullName = `${first} ${last}`.trim()
    return { value: user.id, label: fullName || user.person.email || 'Usuario sin nombre' }
  })

  return (
    <div className="audit-logs-filters">
      <SelectField
        id="audit-logs-filter-user"
        label="Usuario afectado"
        placeholder="Todos los usuarios"
        hint="Filtra por el usuario sobre el que se hizo el cambio, no por quién lo ejecutó."
        options={userOptions}
        value={userId}
        onChange={(event) => onUserIdChange(event.target.value)}
      />
      <SelectField
        id="audit-logs-filter-action"
        label="Acción"
        placeholder="Todas las acciones"
        options={ACTION_OPTIONS}
        value={action}
        onChange={(event) => onActionChange(event.target.value)}
      />
      <div className="audit-logs-filters__dates">
        <label className="ui-field__label" htmlFor="audit-logs-filter-from">
          Desde
        </label>
        <input
          id="audit-logs-filter-from"
          type="date"
          className="ui-field__control"
          value={fromDate}
          max={toDate || undefined}
          onChange={(event) => onFromDateChange(event.target.value)}
        />
      </div>
      <div className="audit-logs-filters__dates">
        <label className="ui-field__label" htmlFor="audit-logs-filter-to">
          Hasta
        </label>
        <input
          id="audit-logs-filter-to"
          type="date"
          className="ui-field__control"
          value={toDate}
          min={fromDate || undefined}
          onChange={(event) => onToDateChange(event.target.value)}
        />
      </div>
    </div>
  )
}
