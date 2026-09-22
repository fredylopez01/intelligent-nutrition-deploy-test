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

import './Activation.css'

const MIN_PASSWORD_LENGTH = 8

const passwordSchema = z
  .string()
  .min(MIN_PASSWORD_LENGTH, `Debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres`)
  .regex(/[a-z]/, 'Debe incluir al menos una letra minúscula')
  .regex(/[A-Z]/, 'Debe incluir al menos una letra mayúscula')
  .regex(/[0-9]/, 'Debe incluir al menos un número')
  .regex(/[^A-Za-z0-9]/, 'Debe incluir al menos un carácter especial')

const activationSchema = z
  .object({
    password: passwordSchema,
    confirmPassword: z.string().min(1, 'Confirma tu contraseña'),
  })
  .refine((values) => values.password === values.confirmPassword, {
    message: 'Las contraseñas no coinciden',
    path: ['confirmPassword'],
  })

type ActivationFormValues = z.infer<typeof activationSchema>

function isInvalidTokenError(error: unknown): boolean {
  if (!(error instanceof ApiError)) return false
  if ([401, 403, 404, 410].includes(error.status)) return true
  return error.status === 400 && /token|expir/i.test(error.message)
}

type Outcome = 'success' | 'invalid' | null

const ACTIVATION_TAGLINE = 'Tu cuenta ya está creada. Define tu contraseña y empieza a trabajar.'

/** Marco común de las tres vistas: mismo panel de marca, etiqueta y (opcional) enlace de vuelta. */
function ActivationLayout({
  children,
  showBack = true,
}: {
  children: ReactNode
  showBack?: boolean
}) {
  return (
    <AuthLayout
      tagline={ACTIVATION_TAGLINE}
      back={showBack ? { to: '/login', label: '← Ir a iniciar sesión' } : undefined}
    >
      <p className="auth-layout__eyebrow">Activación de cuenta</p>
      {children}
    </AuthLayout>
  )
}

export function ActivateAccountPage() {
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token')
  const navigate = useNavigate()

  const [outcome, setOutcome] = useState<Outcome>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const [showPasswords, setShowPasswords] = useState(false)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ActivationFormValues>({
    resolver: zodResolver(activationSchema),
  })

  const onSubmit = async ({ password }: ActivationFormValues) => {
    if (!token) return
    setFormError(null)
    try {
      await authService.activate({ token, password })
      setOutcome('success')
    } catch (error) {
      if (isInvalidTokenError(error)) {
        setOutcome('invalid')
        return
      }
      setFormError(
        error instanceof ApiError
          ? error.message
          : 'No pudimos conectar con el servidor. Revisa tu conexión e intenta de nuevo.',
      )
    }
  }

  const passwordType = showPasswords ? 'text' : 'password'

  if (outcome === 'success') {
    return (
      <ActivationLayout showBack={false}>
        <h1 className="auth-layout__title">Cuenta activada</h1>
        <div className="activation__alert">
          <Alert tone="success">
            Tu contraseña quedó guardada. Ya puedes iniciar sesión con tu correo y esa contraseña.
          </Alert>
        </div>
        <Button fullWidth onClick={() => navigate('/login', { replace: true })}>
          Ir a iniciar sesión
        </Button>
      </ActivationLayout>
    )
  }

  if (!token || outcome === 'invalid') {
    return (
      <ActivationLayout showBack={false}>
        <h1 className="auth-layout__title">Enlace no válido</h1>
        <div className="activation__alert">
          <Alert tone="error">
            {token
              ? 'Este enlace de activación no es válido o ya expiró.'
              : 'Este enlace de activación está incompleto.'}
          </Alert>
        </div>
        <p className="auth-layout__hint">
          Si ya activaste tu cuenta, puedes iniciar sesión. Si no, contacta a tu administrador para
          que te reenvíe la activación.
        </p>
        <Button fullWidth onClick={() => navigate('/login')}>
          Ir a iniciar sesión
        </Button>
      </ActivationLayout>
    )
  }

  return (
    <ActivationLayout>
      <h1 className="auth-layout__title">Activa tu cuenta</h1>
      <p className="auth-layout__hint">
        Crea la contraseña con la que vas a ingresar. Al guardarla, tu cuenta queda habilitada.
      </p>

      {formError && (
        <div className="activation__alert">
          <Alert tone="error">{formError}</Alert>
        </div>
      )}

      <form className="activation__form" onSubmit={handleSubmit(onSubmit)} noValidate>
        <TextField
          id="password"
          label="Contraseña"
          type={passwordType}
          autoComplete="new-password"
          hint={`Mínimo ${MIN_PASSWORD_LENGTH} caracteres, con mayúscula, minúscula, número y carácter especial.`}
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

        <label className="activation__toggle">
          <input
            type="checkbox"
            checked={showPasswords}
            onChange={(event) => setShowPasswords(event.target.checked)}
          />
          Mostrar contraseñas
        </label>

        <Button type="submit" fullWidth disabled={isSubmitting}>
          {isSubmitting ? 'Activando...' : 'Activar cuenta'}
        </Button>
      </form>
    </ActivationLayout>
  )
}
