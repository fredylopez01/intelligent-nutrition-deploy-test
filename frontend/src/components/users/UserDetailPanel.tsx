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
import { getUserEmail, getUserFullName, getUserStatus } from '../../utils/users'
import { Alert } from '../ui/Alert'
import { Avatar } from '../ui/Avatar'
import { Button } from '../ui/Button'
import { Modal } from '../ui/Modal'
import { TextField } from '../ui/TextField'

import './UserDetailPanel.css'

const updateUserSchema = z.object({
  firstName: z
    .string()
    .trim()
    .min(1, 'Ingresa los nombres')
    .max(100, 'Los nombres no pueden superar 100 caracteres'),
  lastName: z
    .string()
    .trim()
    .min(1, 'Ingresa los apellidos')
    .max(100, 'Los apellidos no pueden superar 100 caracteres'),
  email: z
    .string()
    .trim()
    .min(1, 'Ingresa el correo electrónico')
    .email('Ingresa un correo válido')
    .max(150, 'El correo no puede superar 150 caracteres'),
  phone: z
    .string()
    .trim()
    .max(30, 'El teléfono no puede superar 30 caracteres')
    .optional()
    .or(z.literal('')),
  address: z
    .string()
    .trim()
    .max(255, 'La dirección no puede superar 255 caracteres')
    .optional()
    .or(z.literal('')),
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
    if (error.status === 403) return 'No tienes permiso para actualizar esta cuenta.'
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
  const [isStatusModalOpen, setIsStatusModalOpen] = useState(false)
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<UpdateUserFormValues>({
    resolver: zodResolver(updateUserSchema),
    values: {
      firstName: user?.person.firstName ?? '',
      lastName: user?.person.lastName ?? '',
      email: user?.person.email ?? '',
      phone: user?.person.phone ?? '',
      address: user?.person.address ?? '',
    },
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
  const fullName = getUserFullName(user)
  const isCurrentUser = currentUser?.id === user.id
  const effectiveRoleId = selectedRoleId ?? user.role.id

  const onSubmit = async (values: UpdateUserFormValues) => {
    setFeedback(null)

    const firstName = values.firstName.trim()
    const lastName = values.lastName.trim()
    const email = values.email.trim().toLowerCase()
    const phone = values.phone?.trim()
    const address = values.address?.trim()

    const person: Record<string, string> = {}
    if (firstName !== (user.person.firstName ?? '')) person.firstName = firstName
    if (lastName !== (user.person.lastName ?? '')) person.lastName = lastName
    if (email !== (user.person.email ?? '')) person.email = email
    if (phone !== (user.person.phone ?? '')) person.phone = phone ?? ''
    if (address !== (user.person.address ?? '')) person.address = address ?? ''

    const roleChanged = effectiveRoleId !== user.role.id

    if (Object.keys(person).length === 0 && !roleChanged) {
      setFeedback({ tone: 'error', text: 'No hay cambios por guardar.' })
      return
    }

    try {
      if (Object.keys(person).length > 0) {
        await usersService.update(user.id, { person }, token)
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

  const handleResendInvitation = async () => {
    setFeedback(null)
    setIsResending(true)
    try {
      await usersService.resendInvitation(getUserEmail(user), token)
      setFeedback({ tone: 'success', text: 'Se reenvió el correo de activación.' })
    } catch (error) {
      setFeedback({ tone: 'error', text: resolveErrorMessage(error) })
    } finally {
      setIsResending(false)
    }
  }

  const handleConfirmStatusChange = async () => {
    setIsUpdatingStatus(true)
    try {
      await usersService.updateStatus(user.id, { active: !user.active }, token)
      setFeedback({
        tone: 'success',
        text: user.active
          ? 'El usuario fue desactivado correctamente.'
          : 'El usuario fue reactivado correctamente.',
      })
      setIsStatusModalOpen(false)
      onUpdated()
    } catch (error) {
      setFeedback({ tone: 'error', text: resolveErrorMessage(error) })
      setIsStatusModalOpen(false)
    } finally {
      setIsUpdatingStatus(false)
    }
  }

  return (
    <div className="user-detail">
      <header className="user-detail__header">
        <p className="user-detail__eyebrow">Usuario seleccionado</p>
      </header>

      <div className="user-detail__body">
        <div className="user-detail__identity">
          <Avatar name={fullName} size="lg" muted={status === 'inactivo'} />
          <div className="user-detail__identity-info">
            <p className="user-detail__name">{fullName}</p>
            <p className="user-detail__email">{getUserEmail(user)}</p>
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

        <div className="user-detail__branches">
          <p className="user-detail__branches-label">Sedes asignadas</p>
          {user.branches.length === 0 ? (
            <p className="user-detail__note">
              Sin sedes asignadas. Usa “Asociar a sede” en el listado.
            </p>
          ) : (
            <ul className="user-detail__branch-list">
              {user.branches.map((branch) => (
                <li key={branch.id}>{branch.name}</li>
              ))}
            </ul>
          )}
        </div>

        {feedback && <Alert tone={feedback.tone}>{feedback.text}</Alert>}

        <form className="user-detail__form" onSubmit={handleSubmit(onSubmit)} noValidate>
          <TextField
            id="edit-user-firstName"
            label="Nombres"
            autoComplete="given-name"
            error={errors.firstName?.message}
            {...register('firstName')}
          />
          <TextField
            id="edit-user-lastName"
            label="Apellidos"
            autoComplete="family-name"
            error={errors.lastName?.message}
            {...register('lastName')}
          />
          <TextField
            id="edit-user-email"
            label="Correo electrónico"
            type="email"
            autoComplete="email"
            error={errors.email?.message}
            {...register('email')}
          />
          <TextField
            id="edit-user-phone"
            label="Teléfono"
            autoComplete="tel"
            error={errors.phone?.message}
            {...register('phone')}
          />
          <TextField
            id="edit-user-address"
            label="Dirección"
            autoComplete="street-address"
            error={errors.address?.message}
            {...register('address')}
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
              onClick={handleResendInvitation}
              disabled={isResending || status !== 'pendiente'}
            >
              {isResending ? 'Reenviando...' : 'Reenviar correo de activación'}
            </Button>
            <Button
              variant={user.active ? 'danger' : 'outline'}
              fullWidth
              onClick={() => setIsStatusModalOpen(true)}
              disabled={isCurrentUser}
              aria-describedby={isCurrentUser ? 'status-hint' : undefined}
            >
              {user.active ? 'Desactivar usuario' : 'Reactivar usuario'}
            </Button>
            {isCurrentUser && (
              <p className="user-detail__note" id="status-hint">
                No puedes cambiar el estado de tu propia cuenta.
              </p>
            )}
          </div>
        </form>
      </div>

      <footer className="user-detail__footer">
        <p>Los permisos no se configuran aquí: los define el rol según la matriz del ADR-002.</p>
      </footer>

      <Modal
        open={isStatusModalOpen}
        title={user.active ? '¿Desactivar esta cuenta?' : '¿Reactivar esta cuenta?'}
        description={
          user.active
            ? `${fullName} no podrá iniciar sesión hasta que se reactive su cuenta.`
            : `${fullName} volverá a poder iniciar sesión.`
        }
        onClose={() => {
          if (!isUpdatingStatus) setIsStatusModalOpen(false)
        }}
      >
        <div className="user-detail__modal-actions">
          <Button
            variant="outline"
            fullWidth
            onClick={() => setIsStatusModalOpen(false)}
            disabled={isUpdatingStatus}
          >
            Cancelar
          </Button>
          <Button
            variant={user.active ? 'danger' : 'primary'}
            fullWidth
            onClick={handleConfirmStatusChange}
            disabled={isUpdatingStatus}
          >
            {isUpdatingStatus ? 'Guardando...' : user.active ? 'Sí, desactivar' : 'Sí, reactivar'}
          </Button>
        </div>
      </Modal>
    </div>
  )
}
