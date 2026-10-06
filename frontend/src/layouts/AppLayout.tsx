import type { ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'

import { Sidebar } from '../components/Sidebar'
import { useAuth } from '../hooks/useAuth'

import './AppLayout.css'

interface AppLayoutProps {
  title: string
  subtitle?: string
  backTo?: string
  backLabel?: string
  actions?: ReactNode
  aside?: ReactNode
  children: ReactNode
}

export function AppLayout({
  title,
  subtitle,
  backTo,
  backLabel = 'Volver',
  actions,
  aside,
  children,
}: AppLayoutProps) {
  const { logout } = useAuth()
  const navigate = useNavigate()
  const handleLogout = () => {
    logout()
    navigate('/login', { replace: true })
  }

  return (
    <div className={`app-layout${aside ? ' app-layout--with-aside' : ''}`}>
      <Sidebar />

      <div className="app-layout__main">
        <header className="app-layout__header">
          <div className="app-layout__heading">
            {backTo && (
              <Link to={backTo} className="app-layout__back" aria-label={backLabel}>
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M19 12H5" />
                  <path d="m12 19-7-7 7-7" />
                </svg>
              </Link>
            )}
            <div className="app-layout__heading-text">
              <h1 className="app-layout__title">{title}</h1>
              {subtitle && <p className="app-layout__subtitle">{subtitle}</p>}
            </div>
          </div>
          <div className="app-layout__header-actions">
            {actions}
            <button type="button" className="app-layout__logout" onClick={handleLogout}>
              Cerrar sesión
            </button>
          </div>
        </header>

        <div className="app-layout__content">{children}</div>
      </div>

      {aside && <aside className="app-layout__aside">{aside}</aside>}
    </div>
  )
}
