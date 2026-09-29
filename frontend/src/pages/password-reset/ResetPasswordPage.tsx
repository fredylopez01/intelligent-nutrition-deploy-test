import { zodResolver } from '@hookform/resolvers/zod'
import { useState, type ReactNode } from 'react'
import { useForm } from 'react-hook-form'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { z } from 'zod'

import { Alert } from '../../components/ui/Alert'
import { Button } from '../../components/ui/Button'
import { TextField } from '../../components/ui/TextField'
import { AuthLayout } from '../../layouts/AuthLayout'
import { authService } from '../../services/auth.service'
import { ApiError } from '../../services/http'

import './PasswordReset.css'

const passwordSchema = z
  .string()
  .min(8, 'Debe tener al menos 8 caracteres')
  .max(128, 'No puede superar los 128 caracteres')
  .regex(/[a-z]/, 'Debe incluir al menos una letra minúscula')
  .regex(/[A-Z]/, 'Debe incluir al menos una letra mayúscula')
  .regex(/[0-9]/, 'Debe incluir al menos un número')
  .regex(/[^A-Za-z0-9]/, 'Debe incluir al menos un carácter especial')

const resetPasswordSchema = z
  .object({
    password: passwordSchema,
    confirmPassword: z.string().min(1, 'Confirma tu contraseña'),
  })
  .refine((values) => values.password === values.confirmPassword, {
    message: 'Las contraseñas no coinciden',
    path: ['confirmPassword'],
  })

type ResetPasswordFormValues = z.infer<typeof resetPasswordSchema>
type ResetOutcome = 'success' | 'invalid' | null

function ResetLayout({ children }: { children: ReactNode }) {
  return (
    <AuthLayout
      tagline="Elige una contraseña nueva para volver a tu espacio de trabajo."
      back={{ to: '/login', label: '← Ir a iniciar sesión' }}
    >
      <p className="auth-layout__eyebrow">Seguridad de cuenta</p>
      {children}
    </AuthLayout>
  )
}

export function ResetPasswordPage() {
  const [searchParams] = useSearchParams()
  const [outcome, setOutcome] = useState<ResetOutcome>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const [showPasswords, setShowPasswords] = useState(false)
  const navigate = useNavigate()
  const token = searchParams.get('token')
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ResetPasswordFormValues>({ resolver: zodResolver(resetPasswordSchema) })

  const onSubmit = async ({ password }: ResetPasswordFormValues) => {
    if (!token) return
    setFormError(null)
    try {
      await authService.resetPassword({ token, password })
      setOutcome('success')
    } catch (error) {
      if (error instanceof ApiError && [400, 404, 410].includes(error.status)) {
        setOutcome('invalid')
        return
      }
      setFormError(
        error instanceof ApiError
          ? error.message
          : 'No pudimos conectar con el servidor. Intenta de nuevo.',
      )
    }
  }

  if (outcome === 'success') {
    return (
      <ResetLayout>
        <h1 className="auth-layout__title">Contraseña actualizada</h1>
        <div className="password-reset__alert">
          <Alert tone="success">Ya puedes iniciar sesión con tu nueva contraseña.</Alert>
        </div>
        <Button fullWidth onClick={() => navigate('/login', { replace: true })}>
          Ir a iniciar sesión
        </Button>
      </ResetLayout>
    )
  }

  if (!token || outcome === 'invalid') {
    return (
      <ResetLayout>
        <h1 className="auth-layout__title">Enlace no válido</h1>
        <div className="password-reset__alert">
          <Alert tone="error">
            El enlace de recuperación no es válido o ya expiró. Solicita uno nuevo para continuar.
          </Alert>
        </div>
        <Button fullWidth onClick={() => navigate('/forget-password')}>
          Solicitar otro enlace
        </Button>
      </ResetLayout>
    )
  }

  const passwordType = showPasswords ? 'text' : 'password'

  return (
    <ResetLayout>
      <h1 className="auth-layout__title">Crea una contraseña nueva</h1>
      <p className="auth-layout__hint">
        Usa al menos 8 caracteres, con mayúscula, minúscula, número y carácter especial.
      </p>
      {formError && (
        <div className="password-reset__alert">
          <Alert tone="error">{formError}</Alert>
        </div>
      )}
      <form className="password-reset__form" onSubmit={handleSubmit(onSubmit)} noValidate>
        <TextField
          id="password"
          label="Contraseña nueva"
          type={passwordType}
          autoComplete="new-password"
          error={errors.password?.message}
          {...register('password')}
        />
        <TextField
          id="confirmPassword"
          label="Confirmar contraseña"
          type={passwordType}
          autoComplete="new-password"
          error={errors.confirmPassword?.message}
          {...register('confirmPassword')}
        />
        <label className="password-reset__toggle">
          <input
            type="checkbox"
            checked={showPasswords}
            onChange={(event) => setShowPasswords(event.target.checked)}
          />
          Mostrar contraseñas
        </label>
        <Button type="submit" fullWidth disabled={isSubmitting}>
          {isSubmitting ? 'Guardando...' : 'Guardar contraseña'}
        </Button>
      </form>
    </ResetLayout>
  )
}
