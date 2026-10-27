import type { User } from '../../types/user'
import { AUDIT_ACTION_OPTIONS, AUDIT_ENTITY_OPTIONS } from '../../utils/auditLogs'
import { SelectField } from '../ui/SelectField'

import './AuditLogsFilters.css'

interface AuditLogsFiltersProps {
  users: User[]
  userId: string
  entity: string
  action: string
  fromDate: string
  toDate: string
  onUserIdChange: (value: string) => void
  onEntityChange: (value: string) => void
  onActionChange: (value: string) => void
  onFromDateChange: (value: string) => void
  onToDateChange: (value: string) => void
}

export function AuditLogsFilters({
  users,
  userId,
  entity,
  action,
  fromDate,
  toDate,
  onUserIdChange,
  onEntityChange,
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
        label="Ejecutado por"
        options={[{ value: '', label: 'Todos los usuarios' }, ...userOptions]}
        value={userId}
        onChange={(event) => onUserIdChange(event.target.value)}
      />
      <SelectField
        id="audit-logs-filter-entity"
        label="Entidad"
        options={[{ value: '', label: 'Todas las entidades' }, ...AUDIT_ENTITY_OPTIONS]}
        value={entity}
        onChange={(event) => onEntityChange(event.target.value)}
      />
      <SelectField
        id="audit-logs-filter-action"
        label="Acción"
        options={[{ value: '', label: 'Todas las acciones' }, ...AUDIT_ACTION_OPTIONS]}
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
