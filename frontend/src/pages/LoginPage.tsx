import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { z } from 'zod'

import { useAuth } from '../hooks/useAuth'
import { AuthLayout } from '../layouts/AuthLayout'
import { getRoleHome } from '../routes/roleHome'

import './LoginPage.css'

const loginSchema = z.object({
  email: z.string().min(1, 'Ingresa tu correo').email('Ingresa un correo válido'),
  password: z.string().min(1, 'Ingresa tu contraseña'),
})

type LoginFormValues = z.infer<typeof loginSchema>

const roleScopes = [
  { role: 'Superadmin', scope: 'Las tres sedes' },
  { role: 'Líder de Sede', scope: 'Su sede completa' },
  { role: 'Ayudante de Sede', scope: 'Operación diaria' },
]

export function LoginPage() {
  const { login, status } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [showPassword, setShowPassword] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

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

      <section className="login-page__roles" aria-labelledby="roles-title">
        <h2 id="roles-title">Qué ve cada rol</h2>
        <ul>
          {roleScopes.map((item) => (
            <li key={item.role}>
              <strong>{item.role}</strong>
              <span>{item.scope}</span>
            </li>
          ))}
        </ul>
      </section>

      <p className="login-page__legal">
        Al continuar aceptas los <Link to="/terminos">Términos</Link> y la{' '}
        <Link to="/privacidad">Política de privacidad</Link>.
      </p>
    </AuthLayout>
  )
}
