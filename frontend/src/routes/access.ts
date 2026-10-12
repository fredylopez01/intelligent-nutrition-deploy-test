import type { RoleName } from '../types/auth'

export const ROUTE_ROLES: Record<string, RoleName[]> = {
  '/sedes': ['SUPERADMIN'],
  '/catalogo/categorias': ['SUPERADMIN', 'BRANCH_LEADER', 'BRANCH_ASSISTANT'],
  '/catalogo/unidades': ['SUPERADMIN', 'BRANCH_LEADER', 'BRANCH_ASSISTANT'],
  '/clientes': ['SUPERADMIN', 'BRANCH_LEADER', 'BRANCH_ASSISTANT'],
  '/proveedores': ['SUPERADMIN', 'BRANCH_LEADER'],
  '/usuarios': ['SUPERADMIN', 'DEV'],
  '/auditoria': ['SUPERADMIN', 'DEV'],
}

export function canAccess(path: string, roleName: string | undefined): boolean {
  const roles = ROUTE_ROLES[path]
  if (!roles) return true
  return roleName !== undefined && (roles as string[]).includes(roleName)
}
