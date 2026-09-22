import type { User, UserStatus } from '../types/user'

export function getUserStatus(user: User): UserStatus {
  if (!user.active) return 'inactivo'
  if (user.mustChangePassword) return 'pendiente'
  return 'activo'
}

export const USER_STATUS_LABELS: Record<UserStatus, string> = {
  activo: 'Activo',
  pendiente: 'Pendiente',
  inactivo: 'Inactivo',
}
