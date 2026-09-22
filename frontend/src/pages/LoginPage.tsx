import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { z } from 'zod'

import { Alert } from '../components/ui/Alert'
import { useAuth } from '../hooks/useAuth'
import { AuthLayout } from '../layouts/AuthLayout'
import { getRoleHome } from '../routes/roleHome'

import './LoginPage.css'

const loginSchema = z.object({
  email: z.string().min(1, 'Ingresa tu correo').email('Ingresa un correo válido'),
  password: z.string().min(1, 'Ingresa tu contraseña'),
})

type LoginFormValues = z.infer<typeof loginSchema>

function GoogleMark() {
  return (
    <svg className="login-page__google-mark" viewBox="0 0 48 48" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M45.12 24.5c0-1.56-.14-3.06-.4-4.5H24v8.51h11.84c-.51 2.75-2.06 5.08-4.39 6.64v5.52h7.11c4.16-3.83 6.56-9.47 6.56-16.17z"
      />
      <path
        fill="#34A853"
        d="M24 46c5.94 0 10.92-1.97 14.56-5.33l-7.11-5.52c-1.97 1.32-4.49 2.1-7.45 2.1-5.73 0-10.58-3.87-12.31-9.07H4.34v5.7C7.96 41.07 15.4 46 24 46z"
      />
      <path
        fill="#FBBC05"
        d="M11.69 28.18A13.2 13.2 0 0 1 11 24c0-1.45.25-2.86.69-4.18v-5.7H4.34A21.99 21.99 0 0 0 2 24c0 3.55.85 6.91 2.34 9.88l7.35-5.7z"
      />
      <path
        fill="#EA4335"
        d="M24 10.75c3.23 0 6.13 1.11 8.41 3.29l6.31-6.31C34.91 4.18 29.93 2 24 2 15.4 2 7.96 6.93 4.34 14.12l7.35 5.7c1.73-5.2 6.58-9.07 12.31-9.07z"
      />
    </svg>
  )
}

export function LoginPage() {
  const { login, status } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [showPassword, setShowPassword] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [showGoogleNotice, setShowGoogleNotice] = useState(false)
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
  })

  const isSubmitting = status === 'loading'
  const passwordHasError = !!errors.password || !!formError

  const onSubmit = async (values: LoginFormValues) => {
    setFormError(null)
    try {
      const loggedUser = await login(values)
      const from = (location.state as { from?: Location })?.from
      const destination = loggedUser ? getRoleHome(loggedUser.role.name) : undefined
      navigate(from?.pathname ?? destination ?? '/dashboard', { replace: true })
    } catch {
      setFormError('Correo o contraseña incorrectos. Intenta de nuevo.')
    }
  }

  return (
    <AuthLayout>
      <Link to="/" className="login-page__back">
        ← Volver a la tienda
      </Link>

      <h1 className="login-page__title">Ingresa a tu cuenta</h1>
      <p className="login-page__hint">
        Las cuentas las crea el Superadmin. Al entrar, el sistema habilita solo lo que autoriza tu
        rol.
      </p>

      <form onSubmit={handleSubmit(onSubmit)} noValidate>
        <div className="form-field">
          <div className="form-field__label-row">
            <label htmlFor="email">Correo electrónico</label>
          </div>
          <input
            id="email"
            type="email"
            autoComplete="username"
            aria-invalid={!!errors.email}
            aria-describedby={errors.email ? 'email-error' : undefined}
            {...register('email')}
          />
          {errors.email && (
            <span id="email-error" role="alert" className="form-field__error">
              {errors.email.message}
            </span>
          )}
        </div>

        <div className="form-field">
          <div className="form-field__label-row">
            <label htmlFor="password">Contraseña</label>
            <Link to="/olvide-contrasena" className="login-page__forgot">
              ¿La olvidaste?
            </Link>
          </div>
          <div className="form-field__password">
            <input
              id="password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              aria-invalid={passwordHasError}
              aria-describedby={passwordHasError ? 'password-error' : undefined}
              {...register('password')}
            />
            <button
              type="button"
              className="form-field__toggle"
              onClick={() => setShowPassword((v) => !v)}
              aria-pressed={showPassword}
            >
              {showPassword ? 'Ocultar' : 'Mostrar'}
            </button>
          </div>
          {passwordHasError && (
            <span id="password-error" role="alert" className="form-field__error">
              {errors.password?.message ?? formError}
            </span>
          )}
        </div>

        <button type="submit" disabled={isSubmitting} className="login-page__submit">
          {isSubmitting ? 'Ingresando...' : 'Ingresar'}
        </button>
      </form>

      <div className="login-page__divider">
        <span>o</span>
      </div>

      <button
        type="button"
        className="login-page__google"
        onClick={() => setShowGoogleNotice(true)}
        aria-expanded={showGoogleNotice}
        aria-controls="google-notice"
      >
        <GoogleMark />
        Continuar con Google
      </button>

      {showGoogleNotice && (
        <div className="login-page__notice" id="google-notice">
          <Alert tone="info">
            <span className="login-page__notice-eyebrow">Coming next</span>
            El ingreso con Google llega en un próximo sprint. Por ahora entra con el correo y la
            contraseña que te envió el Superadmin.
          </Alert>
        </div>
      )}

      <p className="login-page__legal">
        Al continuar aceptas los <Link to="/terminos">Términos</Link> y la{' '}
        <Link to="/privacidad">Política de privacidad</Link>.
      </p>
    </AuthLayout>
  )
}
