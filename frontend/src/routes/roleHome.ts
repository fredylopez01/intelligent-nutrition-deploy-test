import type { RoleName } from '../types/auth'
export const roleHome: Record<RoleName, string> = {
  'SUPER ADMIN': '/dashboard',
  'Lider de sede': '/dashboard',
  'Ayudante de sede': '/pos',
}

export function getRoleHome(role: RoleName): string {
  return roleHome[role] ?? '/dashboard'
}
