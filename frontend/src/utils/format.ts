const ROLE_LABELS: Record<string, string> = {
  SUPERADMIN: 'Superadmin',
  BRANCH_LEADER: 'Líder de Sede',
  BRANCH_ASSISTANT: 'Ayudante de Sede',
}

export function getRoleLabel(roleName: string): string {
  return ROLE_LABELS[roleName.trim().toUpperCase()] ?? roleName
}

export function getInitials(fullName: string): string {
  const words = fullName.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return '?'

  const first = words[0][0] ?? ''
  const last = words.length > 1 ? (words[words.length - 1][0] ?? '') : ''
  return `${first}${last}`.toUpperCase()
}

export function formatDateTime(value: string | null): string {
  if (!value) return 'Nunca'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Sin registro'
  return new Intl.DateTimeFormat('es-CO', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date)
}

const ACTION_LABELS: Record<string, string> = {
  CREATE: 'Creación',
  UPDATE: 'Actualización',
  ACTIVATE: 'Activación',
  DEACTIVATE: 'Desactivación',
  ASSIGN: 'Asignación',
  UNASSIGN: 'Desasignación',
  PASSWORD_RESET: 'Restablecimiento de contraseña',
  ROLE_ASSIGNMENT: 'Asignación de rol',
  INVENTORY_ADJUSTMENT: 'Ajuste de inventario',
  INVENTORY_TRANSFER: 'Transferencia de inventario',
  SALE_REVERSAL: 'Reversión de venta',
}

export function getActionLabel(action: string): string {
  return ACTION_LABELS[action.trim().toUpperCase()] ?? action
}

const ENTITY_LABELS: Record<string, string> = {
  USER: 'Usuario',
  BRANCH: 'Sede',
}

export function getEntityLabel(entity: string): string {
  return ENTITY_LABELS[entity.trim().toUpperCase()] ?? entity
}
