import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'

import { Sidebar } from '../components/Sidebar'
import { useAuth } from '../hooks/useAuth'

import './AppLayout.css'

interface AppLayoutProps {
  title: string
  actions?: ReactNode
  aside?: ReactNode
  children: ReactNode
}

export function AppLayout({ title, actions, aside, children }: AppLayoutProps) {
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
          <h1 className="app-layout__title">{title}</h1>
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
