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

export function formatLongDate(isoDate: string): string {
  return new Intl.DateTimeFormat('es-CO', { dateStyle: 'long', timeZone: 'UTC' }).format(
    new Date(`${isoDate}T00:00:00Z`),
  )
}

export const ACTION_LABELS: Record<string, string> = {
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
  POST_CLOSURE_ADJUSTMENT: 'Ajuste posterior al cierre',
  CONFIRM: 'Confirmación',
  REVERSE: 'Reversión',
  RECEIVE: 'Recepción',
  DELETE: 'Eliminación',
}

export function getActionLabel(action: string): string {
  return ACTION_LABELS[action.trim().toUpperCase()] ?? action
}

export const ENTITY_LABELS: Record<string, string> = {
  USER: 'Usuario',
  BRANCH: 'Sede',
  CATEGORY: 'Categoría',
  CUSTOMER: 'Cliente',
  SUPPLIER: 'Proveedor',
  PRODUCT: 'Producto',
  PRODUCT_IMAGE: 'Imagen de producto',
  UNIT_MEASURE: 'Unidad de medida',
  PAYMENT_METHOD: 'Método de pago',
  BRANCH_INVENTORY: 'Inventario de sede',
  INVENTORY_MOVEMENT: 'Movimiento de inventario',
  INVENTORY_CLOSURE: 'Cierre de inventario',
  PURCHASE: 'Compra',
  SALE: 'Venta',
}

export function getEntityLabel(entity: string): string {
  return ENTITY_LABELS[entity.trim().toUpperCase()] ?? entity
}
