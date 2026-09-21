import { NavLink, useLocation } from 'react-router-dom'

import logo from '../assets/logo-intelligent-nutrition.png'
import { useAuth } from '../hooks/useAuth'
import { getRoleLabel } from '../utils/format'

import { Avatar } from './ui/Avatar'

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
    label: 'Proveedores',
    to: '/proveedores',
    subs: [
      { label: 'Proveedores', to: '/proveedores' },
      { label: 'Compras y recepción', to: '/proveedores/compras' },
    ],
  },
  { label: 'Usuarios', to: '/usuarios', allowedRoles: ['SUPER ADMIN'] },
  {
    label: 'Reportes',
    to: '/reportes',
    subs: [
      { label: 'Reportes', to: '/reportes' },
      { label: 'Reposición sugerida', to: '/reportes/reposicion' },
    ],
  },
]
export function Sidebar() {
  const { user } = useAuth()
  const { pathname } = useLocation()
  const roleName = user?.role.name ?? ''
  return (
    <aside className="sidebar">
      <img className="sidebar__logo" src={logo} alt="Intelligent Nutrition" />
      {user && (
        <div className="sidebar__user">
          <Avatar name={user.fullName} size="md" highlighted />
          <div className="sidebar__user-info">
            <p className="sidebar__user-name">{user.fullName}</p>
            <p className="sidebar__user-role">{getRoleLabel(roleName)}</p>
          </div>
        </div>
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
