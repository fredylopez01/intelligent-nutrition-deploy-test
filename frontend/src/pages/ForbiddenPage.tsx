import { Link, useLocation, useNavigate } from 'react-router-dom'

import { Button } from '../components/ui/Button'
import { useAuth } from '../hooks/useAuth'
import { AppLayout } from '../layouts/AppLayout'
import { getRoleLabel } from '../utils/format'

import './ForbiddenPage.css'

export function ForbiddenPage() {
  const { user } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()

  const from = (location.state as { from?: string } | null)?.from
  const historyIndex = (window.history.state as { idx?: number } | null)?.idx ?? 0
  const canGoBack = historyIndex > 0
  const roleLabel = user ? getRoleLabel(user.role.name) : null

  return (
    <AppLayout title="Acceso no autorizado">
      <section className="forbidden" aria-labelledby="forbidden-title">
        <p className="forbidden__code" aria-hidden="true">
          403
        </p>
        <p className="forbidden__eyebrow">Acceso no autorizado</p>
        <h2 id="forbidden-title" className="forbidden__title">
          No tienes permiso para ver esta página
        </h2>
        <p className="forbidden__description">
          {roleLabel
            ? `Tu rol (${roleLabel}) no tiene acceso a este módulo.`
            : 'Tu cuenta no tiene acceso a este módulo.'}{' '}
          {user?.role.name === 'SUPERADMIN'
            ? 'Revisa con el equipo de desarrollo los permisos de este módulo.'
            : 'Si necesitas entrar, pide acceso al Superadmin.'}
        </p>
        {from && (
          <p className="forbidden__path">
            Intentaste abrir <code>{from}</code>
          </p>
        )}
        <div className="forbidden__actions">
          <Link className="forbidden__home" to="/dashboard">
            Volver al dashboard
          </Link>
          {canGoBack && (
            <Button variant="outline" onClick={() => navigate(-1)}>
              Volver atrás
            </Button>
          )}
        </div>
      </section>
    </AppLayout>
  )
}
