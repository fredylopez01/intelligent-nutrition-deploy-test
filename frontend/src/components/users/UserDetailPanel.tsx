import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'

import { useAuth } from '../../hooks/useAuth'
import { useRoles } from '../../hooks/useRoles'
import { ApiError } from '../../services/http'
import { usersService } from '../../services/users.service'
import type { User } from '../../types/user'
import { formatDateTime, getRoleLabel } from '../../utils/format'
import { getUserStatus } from '../../utils/users'
import { Alert } from '../ui/Alert'
import { Avatar } from '../ui/Avatar'
import { Button } from '../ui/Button'
import { TextField } from '../ui/TextField'

import './UserDetailPanel.css'

const updateUserSchema = z.object({
  fullName: z
    .string()
    .trim()
    .min(2, 'El nombre debe tener al menos 2 caracteres')
    .max(150, 'El nombre no puede superar 150 caracteres'),
  email: z
    .string()
    .trim()
    .min(1, 'Ingresa el correo electrónico')
    .email('Ingresa un correo válido')
    .max(150, 'El correo no puede superar 150 caracteres'),
})

type UpdateUserFormValues = z.infer<typeof updateUserSchema>

interface UserDetailPanelProps {
  user: User | null
  onUpdated: () => void
}

function resolveErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 409) return 'Ese correo ya está registrado en otra cuenta.'
    if (error.status === 404) return 'El usuario o el rol ya no existe. Recarga el listado.'
    if (error.status === 403) return 'Solo un Superadmin puede actualizar otras cuentas.'
    return error.message
  }

  return 'No fue posible guardar los cambios. Intenta de nuevo.'
}

export function UserDetailPanel({ user, onUpdated }: UserDetailPanelProps) {
  const { token, user: currentUser } = useAuth()
  const { roles, isLoading: rolesLoading } = useRoles()
  const [selectedRoleId, setSelectedRoleId] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<{ tone: 'success' | 'error'; text: string } | null>(null)
  const [isResending, setIsResending] = useState(false)
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<UpdateUserFormValues>({
    resolver: zodResolver(updateUserSchema),
    values: { fullName: user?.fullName ?? '', email: user?.email ?? '' },
  })

  if (!user) {
    return (
      <div className="user-detail user-detail--empty">
        <p className="user-detail__eyebrow">Usuario seleccionado</p>
        <p className="user-detail__placeholder">
          Selecciona un usuario del listado para consultar sus datos y actualizarlos.
        </p>
      </div>
    )
  }

  const status = getUserStatus(user)
  const isCurrentUser = currentUser?.id === user.id
  const effectiveRoleId = selectedRoleId ?? user.role.id
  const onSubmit = async (values: UpdateUserFormValues) => {
    setFeedback(null)
    const fullName = values.fullName.trim()
    const email = values.email.trim().toLowerCase()
    const dataChanged = fullName !== user.fullName || email !== user.email
    const roleChanged = effectiveRoleId !== user.role.id
    if (!dataChanged && !roleChanged) {
      setFeedback({ tone: 'error', text: 'No hay cambios por guardar.' })
      return
    }
    try {
      if (dataChanged) {
        await usersService.update(user.id, { fullName, email }, token)
      }

      if (roleChanged) {
        await usersService.updateRole(user.id, { roleId: effectiveRoleId }, token)
      }
      setSelectedRoleId(null)
      setFeedback({ tone: 'success', text: 'Los cambios se guardaron correctamente.' })
      onUpdated()
    } catch (error) {
      setFeedback({ tone: 'error', text: resolveErrorMessage(error) })
    }
  }

  const handleResendActivation = async () => {
    setFeedback(null)
    setIsResending(true)
    try {
      await usersService.resendActivation(user.email, token)
      setFeedback({ tone: 'success', text: 'Se reenvió el correo de activación.' })
    } catch (error) {
      setFeedback({ tone: 'error', text: resolveErrorMessage(error) })
    } finally {
      setIsResending(false)
    }
  }

  return (
    <div className="user-detail">
      <header className="user-detail__header">
        <p className="user-detail__eyebrow">Usuario seleccionado</p>
      </header>
      <div className="user-detail__body">
        <div className="user-detail__identity">
          <Avatar name={user.fullName} size="lg" muted={status === 'inactivo'} />
          <div className="user-detail__identity-info">
            <p className="user-detail__name">{user.fullName}</p>
            <p className="user-detail__email">{user.email}</p>
          </div>
        </div>
        <dl className="user-detail__meta">
          <div>
            <dt>Último ingreso</dt>
            <dd>{formatDateTime(user.lastLoginAt)}</dd>
          </div>
          <div>
            <dt>Cuenta creada</dt>
            <dd>{formatDateTime(user.createdAt)}</dd>
          </div>
        </dl>
        {feedback && <Alert tone={feedback.tone}>{feedback.text}</Alert>}

        <form className="user-detail__form" onSubmit={handleSubmit(onSubmit)} noValidate>
          <TextField
            id="edit-user-fullName"
            label="Nombre completo"
            autoComplete="name"
            error={errors.fullName?.message}
            {...register('fullName')}
          />
          <TextField
            id="edit-user-email"
            label="Correo electrónico"
            type="email"
            autoComplete="email"
            error={errors.email?.message}
            {...register('email')}
          />
          <fieldset className="user-detail__roles" disabled={isCurrentUser || rolesLoading}>
            <legend className="user-detail__roles-legend">Rol</legend>
            {roles
              .filter((role) => role.active !== false || role.id === user.role.id)
              .map((role) => {
                const isChecked = role.id === effectiveRoleId
                const isCurrentRole = role.id === user.role.id
                return (
                  <label
                    key={role.id}
                    className={`user-detail__role${isChecked ? ' user-detail__role--checked' : ''}`}
                  >
                    <input
                      type="radio"
                      name="roleId"
                      value={role.id}
                      className="sr-only"
                      aria-label={getRoleLabel(role.name)}
                      checked={isChecked}
                      onChange={() => setSelectedRoleId(role.id)}
                    />
                    <span>{getRoleLabel(role.name)}</span>
                    {isCurrentRole && <span className="user-detail__role-tag">Actual</span>}
                  </label>
                )
              })}
            {isCurrentUser && <p className="user-detail__note">No puedes cambiar tu propio rol.</p>}
          </fieldset>

          <div className="user-detail__actions">
            <Button type="submit" fullWidth disabled={isSubmitting}>
              {isSubmitting ? 'Guardando...' : 'Guardar cambios'}
            </Button>
            <Button
              variant="outline"
              fullWidth
              onClick={handleResendActivation}
              disabled={isResending || status !== 'pendiente'}
            >
              {isResending ? 'Reenviando...' : 'Reenviar correo de activación'}
            </Button>
            <Button variant="danger" fullWidth disabled aria-describedby="deactivate-hint">
              Desactivar usuario
            </Button>
            <p className="user-detail__note" id="deactivate-hint">
              Desactivar cuentas llega cuando el backend exponga ese endpoint.
            </p>
          </div>
        </form>
      </div>
      <footer className="user-detail__footer">
        <p>Los permisos no se configuran aquí: los define el rol según la matriz del ADR-002.</p>
      </footer>
    </div>
  )
}
