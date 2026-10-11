import { NavLink, useLocation } from 'react-router-dom'

import { useAuth } from '../hooks/useAuth'
import { useBrandAssets } from '../hooks/useBrandAssets'
import { getRoleLabel } from '../utils/format'

import { ThemeMenu } from './ThemeMenu'
import { Avatar } from './ui/Avatar'
import { UserMenu } from './UserMenu'

import './Sidebar.css'

interface NavItem {
  label: string
  to: string
  allowedRoles?: string[]
  subs?: { label: string; to: string }[]
}

const NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard', to: '/dashboard' },
  { label: 'Sedes', to: '/sedes' },
  {
    label: 'Inventario',
    to: '/inventario',
    subs: [
      { label: 'Existencias', to: '/inventario' },
      { label: 'Movimientos', to: '/inventario/movimientos' },
      { label: 'Cierre diario', to: '/inventario/cierre' },
    ],
  },
  { label: 'Catálogo', to: '/catalogo' },
  {
    label: 'POS',
    to: '/pos',
    subs: [
      { label: 'Punto de venta', to: '/pos' },
      { label: 'Ventas', to: '/pos/ventas' },
    ],
  },
  {
    label: 'Clientes',
    to: '/clientes',
    allowedRoles: ['SUPERADMIN', 'BRANCH_LEADER', 'BRANCH_ASSISTANT'],
  },
  {
    label: 'Proveedores',
    to: '/proveedores',
    subs: [
      { label: 'Proveedores', to: '/proveedores' },
      { label: 'Compras y recepción', to: '/proveedores/compras' },
    ],
  },
  {
    label: 'Usuarios',
    to: '/usuarios',
    allowedRoles: ['SUPERADMIN', 'DEV'],
  },
  {
    label: 'Reportes',
    to: '/reportes',
    subs: [
      { label: 'Reportes', to: '/reportes' },
      { label: 'Reposición sugerida', to: '/reportes/reposicion' },
    ],
  },
  {
    label: 'Auditoría',
    to: '/auditoria',
    allowedRoles: ['SUPERADMIN', 'DEV'],
  },
]
export function Sidebar() {
  const { user } = useAuth()
  const { pathname } = useLocation()
  const { logo } = useBrandAssets()
  const roleName = user?.role.name ?? ''
  return (
    <aside className="sidebar">
      <div className="sidebar__brand">
        <img className="sidebar__logo" src={logo} alt="Intelligent Nutrition" />
        <ThemeMenu />
      </div>
      {user && (
        <UserMenu triggerClassName="sidebar__user">
          <Avatar name={user.fullName} size="md" highlighted />
          <div className="sidebar__user-info">
            <p className="sidebar__user-name">{user.fullName}</p>
            <p className="sidebar__user-role">{getRoleLabel(roleName)}</p>
          </div>
        </UserMenu>
      )}
      <nav className="sidebar__nav" aria-label="Navegación principal">
        {NAV_ITEMS.map((item) => {
          const denied = item.allowedRoles && !item.allowedRoles.includes(roleName)
          if (denied) {
            return (
              <span key={item.to} className="sidebar__link sidebar__link--denied" aria-disabled>
                {item.label}
              </span>
            )
          }

          const isSectionActive = pathname === item.to || pathname.startsWith(`${item.to}/`)
          return (
            <div key={item.to}>
              <NavLink
                to={item.to}
                className={`sidebar__link${isSectionActive ? ' sidebar__link--active' : ''}`}
              >
                {isSectionActive && <span className="sidebar__marker" aria-hidden="true" />}
                {item.label}
              </NavLink>
              {item.subs && isSectionActive && (
                <div className="sidebar__subs">
                  {item.subs.map((sub) => (
                    <NavLink
                      key={sub.to}
                      to={sub.to}
                      end
                      className={({ isActive }) =>
                        `sidebar__sub${isActive ? ' sidebar__sub--active' : ''}`
                      }
                    >
                      {sub.label}
                    </NavLink>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </nav>
      <div className="sidebar__scope">
        <p className="sidebar__scope-label">Alcance de datos</p>
        <div className="sidebar__scope-value">
          <span>Todas las sedes</span>
          <span aria-hidden="true">▾</span>
        </div>
      </div>
    </aside>
  )
}
