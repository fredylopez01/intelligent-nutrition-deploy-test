import { useState } from 'react'
import { Link, useLocation, useParams, useSearchParams } from 'react-router-dom'

import { Alert } from '../../components/ui/Alert'
import { Avatar } from '../../components/ui/Avatar'
import { Button } from '../../components/ui/Button'
import { EmptyState } from '../../components/ui/EmptyState'
import { Modal } from '../../components/ui/Modal'
import { Tabs } from '../../components/ui/Tabs'
import type { TabItem } from '../../components/ui/Tabs'
import { AssignUserBranchForm } from '../../components/users/AssignUserBranchForm'
import { StatusBadge } from '../../components/users/StatusBadge'
import { UserAccessPanel } from '../../components/users/UserAccessPanel'
import { UserPersonalDataForm } from '../../components/users/UserPersonalDataForm'
import { useAuth } from '../../hooks/useAuth'
import { useUser } from '../../hooks/useUser'
import { AppLayout } from '../../layouts/AppLayout'
import { ApiError } from '../../services/http'
import { usersService } from '../../services/users.service'
import { formatDateTime, getRoleLabel } from '../../utils/format'
import { getUserEmail, getUserFullName, getUserStatus } from '../../utils/users'

import './UserDetailPage.css'

const iconProps = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.6,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
}

const TABS: TabItem[] = [
  {
    id: 'datos',
    label: 'Datos personales',
    icon: (
      <svg {...iconProps}>
        <circle cx="12" cy="8" r="4" />
        <path d="M4 20c1.5-3.5 4.5-5 8-5s6.5 1.5 8 5" />
      </svg>
    ),
  },
  {
    id: 'acceso',
    label: 'Rol y acceso',
    icon: (
      <svg {...iconProps}>
        <rect x="4" y="11" width="16" height="10" rx="2" />
        <path d="M8 11V7a4 4 0 0 1 8 0v4" />
      </svg>
    ),
  },
  {
    id: 'sedes',
    label: 'Sedes',
    icon: (
      <svg {...iconProps}>
        <path d="M12 21s-7-6.1-7-11.5a7 7 0 0 1 14 0C19 14.9 12 21 12 21z" />
        <circle cx="12" cy="9.5" r="2.5" />
      </svg>
    ),
  },
]

const TAB_IDS = TABS.map((tab) => tab.id)

export function UserDetailPage() {
  const { userId } = useParams()
  const location = useLocation()
  const [searchParams, setSearchParams] = useSearchParams()
  const { token, user: currentUser } = useAuth()
  const { status, user, error, refetch } = useUser(userId)

  const [isStatusModalOpen, setIsStatusModalOpen] = useState(false)
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false)
  const [statusFeedback, setStatusFeedback] = useState<{
    tone: 'success' | 'error'
    text: string
  } | null>(null)

  const backTo = (location.state as { from?: string } | null)?.from ?? '/usuarios'
  const requestedTab = searchParams.get('tab') ?? ''
  const activeTab = TAB_IDS.includes(requestedTab) ? requestedTab : 'datos'

  const changeTab = (id: string) => {
    setSearchParams({ tab: id }, { replace: true, state: location.state })
  }

  if (status === 'loading') {
    return (
      <AppLayout title="Usuario" backTo={backTo} backLabel="Volver al listado de usuarios">
        <div className="user-page" aria-busy="true">
          <span className="sr-only">Cargando usuario...</span>
          <div className="user-page__profile user-page__profile--skeleton" aria-hidden="true">
            <span className="user-page__skeleton user-page__skeleton--avatar" />
            <span className="user-page__skeleton user-page__skeleton--line" />
            <span className="user-page__skeleton user-page__skeleton--short" />
          </div>
          <div className="user-page__main" aria-hidden="true">
            <span className="user-page__skeleton user-page__skeleton--tabs" />
            <span className="user-page__skeleton user-page__skeleton--panel" />
          </div>
        </div>
      </AppLayout>
    )
  }

  if (status === 'not-found' || status === 'error' || !user) {
    return (
      <AppLayout title="Usuario" backTo={backTo} backLabel="Volver al listado de usuarios">
        <div className="user-page__missing">
          <EmptyState
            title={
              status === 'not-found' ? 'Este usuario no existe' : 'No se pudo cargar el usuario'
            }
            description={
              status === 'not-found'
                ? 'Puede que el enlace esté mal escrito o que la cuenta ya no esté disponible.'
                : (error ?? 'Revisa tu conexión e intenta de nuevo.')
            }
          >
            <div className="user-page__missing-actions">
              {status === 'error' && (
                <Button variant="outline" onClick={refetch}>
                  Reintentar
                </Button>
              )}
              <Link className="user-page__missing-link" to={backTo}>
                Volver al listado
              </Link>
            </div>
          </EmptyState>
        </div>
      </AppLayout>
    )
  }

  const fullName = getUserFullName(user)
  const userStatus = getUserStatus(user)
  const isCurrentUser = currentUser?.id === user.id

  const handleConfirmStatus = async () => {
    setIsUpdatingStatus(true)
    setStatusFeedback(null)
    try {
      await usersService.updateStatus(user.id, { active: !user.active }, token)
      setStatusFeedback({
        tone: 'success',
        text: user.active
          ? `${fullName} fue desactivado. Ya no puede iniciar sesión.`
          : `${fullName} fue reactivado.`,
      })
      setIsStatusModalOpen(false)
      refetch()
    } catch (err) {
      setStatusFeedback({
        tone: 'error',
        text:
          err instanceof ApiError && err.status === 403
            ? 'No tienes permiso para cambiar el estado de esta cuenta.'
            : err instanceof Error
              ? err.message
              : 'No fue posible cambiar el estado. Intenta de nuevo.',
      })
      setIsStatusModalOpen(false)
    } finally {
      setIsUpdatingStatus(false)
    }
  }

  const statusAction = isCurrentUser ? null : (
    <Button variant={user.active ? 'danger' : 'outline'} onClick={() => setIsStatusModalOpen(true)}>
      {user.active ? 'Desactivar usuario' : 'Reactivar usuario'}
    </Button>
  )

  return (
    <AppLayout
      title={fullName}
      subtitle={`Cuenta creada el ${formatDateTime(user.createdAt)}`}
      backTo={backTo}
      backLabel="Volver al listado de usuarios"
      actions={statusAction}
    >
      {statusFeedback && (
        <div className="user-page__feedback">
          <Alert tone={statusFeedback.tone}>{statusFeedback.text}</Alert>
        </div>
      )}

      <div className="user-page">
        <section className="user-page__profile" aria-labelledby="user-profile-name">
          <Avatar name={fullName} size="xl" muted={userStatus === 'inactivo'} />
          <h2 id="user-profile-name" className="user-page__name">
            {fullName}
          </h2>
          <p className="user-page__email">{getUserEmail(user)}</p>
          <StatusBadge status={userStatus} />

          <dl className="user-page__facts">
            <div className="user-page__fact">
              <dt>Rol</dt>
              <dd>{getRoleLabel(user.role.name)}</dd>
            </div>
            <div className="user-page__fact">
              <dt>Sedes</dt>
              <dd>
                {user.branches.length === 0 ? (
                  <span className="user-page__empty-value">Sin asignar</span>
                ) : (
                  <ul className="user-page__chips">
                    {user.branches.map((branch) => (
                      <li key={branch.id}>{branch.name}</li>
                    ))}
                  </ul>
                )}
              </dd>
            </div>
            <div className="user-page__fact">
              <dt>Teléfono</dt>
              <dd>
                {user.person.phone ?? <span className="user-page__empty-value">Sin registrar</span>}
              </dd>
            </div>
            <div className="user-page__fact">
              <dt>Dirección</dt>
              <dd>
                {user.person.address ?? (
                  <span className="user-page__empty-value">Sin registrar</span>
                )}
              </dd>
            </div>
            <div className="user-page__fact">
              <dt>Último ingreso</dt>
              <dd className="user-page__numeric">{formatDateTime(user.lastLoginAt)}</dd>
            </div>
          </dl>
        </section>

        <div className="user-page__main">
          <Tabs
            items={TABS}
            activeId={activeTab}
            onChange={changeTab}
            idPrefix="user"
            label="Secciones del usuario"
          />

          <div
            className="user-page__panel"
            role="tabpanel"
            id={`user-panel-${activeTab}`}
            aria-labelledby={`user-tab-${activeTab}`}
            tabIndex={0}
          >
            {activeTab === 'datos' && <UserPersonalDataForm user={user} onSaved={refetch} />}

            {activeTab === 'acceso' && <UserAccessPanel user={user} onSaved={refetch} />}

            {activeTab === 'sedes' && (
              <>
                <p className="user-page__panel-text user-page__panel-lead">
                  Sedes en las que trabaja el usuario. Desactivar una asignación conserva su
                  historial.
                </p>
                <AssignUserBranchForm fixedUserId={user.id} onAssigned={refetch} />
              </>
            )}
          </div>
        </div>
      </div>

      <Modal
        open={isStatusModalOpen}
        title={user.active ? '¿Desactivar esta cuenta?' : '¿Reactivar esta cuenta?'}
        description={
          user.active
            ? `${fullName} no podrá iniciar sesión hasta que se reactive su cuenta. Su historial se conserva.`
            : `${fullName} volverá a poder iniciar sesión.`
        }
        onClose={() => {
          if (!isUpdatingStatus) setIsStatusModalOpen(false)
        }}
      >
        <div className="user-page__modal-actions">
          <Button
            variant="outline"
            onClick={() => setIsStatusModalOpen(false)}
            disabled={isUpdatingStatus}
          >
            Cancelar
          </Button>
          <Button
            variant={user.active ? 'danger' : 'primary'}
            onClick={() => void handleConfirmStatus()}
            disabled={isUpdatingStatus}
          >
            {isUpdatingStatus ? 'Guardando...' : user.active ? 'Sí, desactivar' : 'Sí, reactivar'}
          </Button>
        </div>
      </Modal>
    </AppLayout>
  )
}
