import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { useNavigate } from 'react-router-dom'
import { z } from 'zod'

import { useAuth } from '../../hooks/useAuth'
import { authService } from '../../services/auth.service'
import { ApiError } from '../../services/http'
import { Alert } from '../ui/Alert'
import { Button } from '../ui/Button'
import { PasswordField } from '../ui/PasswordField'

import './ChangePasswordForm.css'

const passwordSchema = z
  .string()
  .min(8, 'Debe tener al menos 8 caracteres')
  .max(128, 'No puede superar los 128 caracteres')
  .regex(/[a-z]/, 'Debe incluir al menos una letra minúscula')
  .regex(/[A-Z]/, 'Debe incluir al menos una letra mayúscula')
  .regex(/[0-9]/, 'Debe incluir al menos un número')
  .regex(/[^A-Za-z0-9]/, 'Debe incluir al menos un carácter especial')

const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Ingresa tu contraseña actual'),
    newPassword: passwordSchema,
    confirmPassword: z.string().min(1, 'Confirma la nueva contraseña'),
  })
  .refine((values) => values.newPassword === values.confirmPassword, {
    message: 'Las contraseñas no coinciden',
    path: ['confirmPassword'],
  })
  .refine((values) => values.newPassword !== values.currentPassword, {
    message: 'La nueva contraseña debe ser diferente a la actual',
    path: ['newPassword'],
  })

type ChangePasswordFormValues = z.infer<typeof changePasswordSchema>

interface Feedback {
  tone: 'success' | 'error'
  message: string
}

const EMPTY_VALUES: ChangePasswordFormValues = {
  currentPassword: '',
  newPassword: '',
  confirmPassword: '',
}

const ERROR_MESSAGES: Record<string, string> = {
  INVALID_CREDENTIALS: 'La contraseña actual es incorrecta.',
  PASSWORDS_ARE_EQUAL: 'La nueva contraseña debe ser diferente a la actual.',
  ACCOUNT_NOT_ACTIVATED: 'Tu cuenta aún no está activada.',
  USER_NOT_FOUND: 'No encontramos tu cuenta. Vuelve a iniciar sesión.',
}

const PASSWORD_REQUIREMENTS = [
  'Mínimo 8 caracteres y máximo 128.',
  'Al menos una letra minúscula y una mayúscula.',
  'Al menos un número y un carácter especial.',
]

export function ChangePasswordForm() {
  const { token, logout } = useAuth()
  const navigate = useNavigate()
  const [feedback, setFeedback] = useState<Feedback | null>(null)
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ChangePasswordFormValues>({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: EMPTY_VALUES,
  })

  const onSubmit = async ({ currentPassword, newPassword }: ChangePasswordFormValues) => {
    setFeedback(null)
    try {
      await authService.changePassword({ currentPassword, newPassword }, token)
      reset()
      setFeedback({ tone: 'success', message: 'Contraseña actualizada exitosamente' })
    } catch (error) {
      if (!(error instanceof ApiError)) {
        setFeedback({
          tone: 'error',
          message: 'No pudimos conectar con el servidor. Intenta de nuevo.',
        })
        return
      }

      if (error.status === 401 && error.code !== 'INVALID_CREDENTIALS') {
        logout()
        navigate('/login', { replace: true })
        return
      }

      const knownMessage = error.code ? ERROR_MESSAGES[error.code] : undefined
      const fallbackMessage =
        error.status === 400 ? 'Revisa los datos ingresados e intenta de nuevo.' : error.message
      setFeedback({ tone: 'error', message: knownMessage ?? fallbackMessage })
    }
  }

  // Without arguments RHF resets the native form; passing values does not clear the DOM under React Compiler.
  const handleReset = () => {
    reset()
    setFeedback(null)
  }

  return (
    <section className="change-password" aria-labelledby="change-password-title">
      <h2 id="change-password-title" className="change-password__title">
        Cambiar contraseña
      </h2>

      {feedback && (
        <div className="change-password__feedback">
          <Alert tone={feedback.tone}>{feedback.message}</Alert>
        </div>
      )}

      <form
        className="change-password__form"
        onSubmit={handleSubmit(onSubmit, () => setFeedback(null))}
        noValidate
      >
        <div className="change-password__grid">
          <div className="change-password__current">
            <PasswordField
              id="currentPassword"
              label="Contraseña actual"
              autoComplete="current-password"
              error={errors.currentPassword?.message}
              {...register('currentPassword')}
            />
          </div>
          <PasswordField
            id="newPassword"
            label="Nueva contraseña"
            autoComplete="new-password"
            error={errors.newPassword?.message}
            {...register('newPassword')}
          />
          <PasswordField
            id="confirmPassword"
            label="Confirmar nueva contraseña"
            autoComplete="new-password"
            error={errors.confirmPassword?.message}
            {...register('confirmPassword')}
          />
        </div>

        <div className="change-password__requirements">
          <p className="change-password__requirements-title">Requisitos de la contraseña:</p>
          <ul className="change-password__requirements-list">
            {PASSWORD_REQUIREMENTS.map((requirement) => (
              <li key={requirement}>{requirement}</li>
            ))}
          </ul>
        </div>

        <div className="change-password__actions">
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Guardando...' : 'Guardar cambios'}
          </Button>
          <Button variant="outline" onClick={handleReset} disabled={isSubmitting}>
            Restablecer
          </Button>
        </div>
      </form>
    </section>
  )
}
