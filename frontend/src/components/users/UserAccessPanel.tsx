import { useState } from 'react'

import { useAuth } from '../../hooks/useAuth'
import { useRoles } from '../../hooks/useRoles'
import { ApiError } from '../../services/http'
import { usersService } from '../../services/users.service'
import type { User } from '../../types/user'
import { formatDateTime, getRoleLabel } from '../../utils/format'
import { getUserEmail, getUserStatus } from '../../utils/users'
import { Alert } from '../ui/Alert'
import { Button } from '../ui/Button'

interface UserAccessPanelProps {
  user: User
  onSaved: () => void
}

type Feedback = { tone: 'success' | 'error'; text: string } | null

function resolveErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 404) return 'El usuario o el rol ya no existe. Vuelve al listado.'
    if (error.status === 403) return 'No tienes permiso para cambiar esta cuenta.'
    return error.message
  }
  return 'No fue posible completar la operación. Intenta de nuevo.'
}

export function UserAccessPanel({ user, onSaved }: UserAccessPanelProps) {
  const { token, user: currentUser } = useAuth()
  const { roles, isLoading: rolesLoading } = useRoles()
  const [selectedRoleId, setSelectedRoleId] = useState<string | null>(null)
  const [roleFeedback, setRoleFeedback] = useState<Feedback>(null)
  const [accessFeedback, setAccessFeedback] = useState<Feedback>(null)
  const [isSavingRole, setIsSavingRole] = useState(false)
  const [isResending, setIsResending] = useState(false)

  const isCurrentUser = currentUser?.id === user.id
  const status = getUserStatus(user)
  const effectiveRoleId = selectedRoleId ?? user.role.id
  const roleChanged = effectiveRoleId !== user.role.id

  const visibleRoles = roles.filter((role) => role.active !== false || role.id === user.role.id)

  const handleSaveRole = async () => {
    setRoleFeedback(null)
    setIsSavingRole(true)
    try {
      await usersService.updateRole(user.id, { roleId: effectiveRoleId }, token)
      setSelectedRoleId(null)
      setRoleFeedback({ tone: 'success', text: 'El rol se actualizó correctamente.' })
      onSaved()
    } catch (error) {
      setRoleFeedback({ tone: 'error', text: resolveErrorMessage(error) })
    } finally {
      setIsSavingRole(false)
    }
  }

  const handleResend = async () => {
    setAccessFeedback(null)
    setIsResending(true)
    try {
      await usersService.resendInvitation(getUserEmail(user), token)
      setAccessFeedback({
        tone: 'success',
        text: `Se reenvió el correo de activación a ${getUserEmail(user)}.`,
      })
    } catch (error) {
      setAccessFeedback({ tone: 'error', text: resolveErrorMessage(error) })
    } finally {
      setIsResending(false)
    }
  }

  return (
    <div className="user-page__stack">
      <section className="user-page__section" aria-labelledby="user-role-title">
        <div className="user-page__section-head">
          <h3 id="user-role-title" className="user-page__section-title">
            Rol
          </h3>
          <p className="user-page__section-text">
            El rol define qué módulos ve el usuario. Los permisos de cada rol no se editan aquí.
          </p>
        </div>

        {roleFeedback && <Alert tone={roleFeedback.tone}>{roleFeedback.text}</Alert>}

        {isCurrentUser && (
          <Alert tone="info">Esta es tu cuenta: no puedes cambiar tu propio rol.</Alert>
        )}

        <fieldset className="user-page__roles" disabled={isCurrentUser || rolesLoading}>
          <legend className="sr-only">Rol del usuario</legend>
          {visibleRoles.map((role) => {
            const isChecked = role.id === effectiveRoleId
            const isCurrentRole = role.id === user.role.id
            return (
              <label
                key={role.id}
                className={`user-page__role${isChecked ? ' user-page__role--checked' : ''}`}
              >
                <input
                  type="radio"
                  name="roleId"
                  value={role.id}
                  className="sr-only"
                  checked={isChecked}
                  onChange={() => setSelectedRoleId(role.id)}
                />
                <span className="user-page__role-radio" aria-hidden="true" />
                <span className="user-page__role-name">{getRoleLabel(role.name)}</span>
                {isCurrentRole && <span className="user-page__role-tag">Actual</span>}
              </label>
            )
          })}
        </fieldset>

        {!isCurrentUser && (
          <div className="user-page__form-actions">
            {roleChanged && (
              <Button variant="ghost" onClick={() => setSelectedRoleId(null)}>
                Descartar
              </Button>
            )}
            <Button onClick={() => void handleSaveRole()} disabled={!roleChanged || isSavingRole}>
              {isSavingRole ? 'Guardando...' : 'Guardar rol'}
            </Button>
          </div>
        )}
      </section>

      <section className="user-page__section" aria-labelledby="user-access-title">
        <div className="user-page__section-head">
          <h3 id="user-access-title" className="user-page__section-title">
            Activación de la cuenta
          </h3>
          {status === 'pendiente' && (
            <p className="user-page__section-text">
              La cuenta todavía no se activa. El enlace de activación vence a los 3 días; si venció
              o no llegó, reenvíalo.
            </p>
          )}
          {status === 'activo' && (
            <p className="user-page__section-text">
              La cuenta está activa. Último ingreso: {formatDateTime(user.lastLoginAt)}.
            </p>
          )}
          {status === 'inactivo' && (
            <p className="user-page__section-text">
              La cuenta está desactivada y no puede iniciar sesión. Reactívala desde el botón de la
              parte superior.
            </p>
          )}
        </div>

        {accessFeedback && <Alert tone={accessFeedback.tone}>{accessFeedback.text}</Alert>}

        {status === 'pendiente' && (
          <div className="user-page__form-actions user-page__form-actions--start">
            <Button variant="outline" onClick={() => void handleResend()} disabled={isResending}>
              {isResending ? 'Reenviando...' : 'Reenviar correo de activación'}
            </Button>
          </div>
        )}
      </section>
    </div>
  )
}
