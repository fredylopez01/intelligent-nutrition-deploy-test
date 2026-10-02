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

export function getUserFullName(user: User): string {
  const name = [user.person.firstName, user.person.lastName].filter(Boolean).join(' ').trim()
  return name || 'Sin nombre'
}

export function getUserEmail(user: User): string {
  return user.person.email ?? 'Sin correo'
}

export function getUserBranchesLabel(user: User): string {
  if (user.branches.length === 0) return 'Sin asignar'
  if (user.branches.length <= 2) return user.branches.map((branch) => branch.name).join(', ')
  return `${user.branches[0].name} +${user.branches.length - 1}`
}
