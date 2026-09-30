import type { RoleName } from '../types/auth'
export const roleHome: Record<RoleName, string> = {
  SUPERADMIN: '/dashboard',
  BRANCH_LEADER: '/dashboard',
  BRANCH_ASSISTANT: '/pos',
  DEV: '/dashboard',
}

export function getRoleHome(role: RoleName): string {
  return roleHome[role] ?? '/dashboard'
}
