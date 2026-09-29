import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'

import { Alert } from '../../components/ui/Alert'
import { Button } from '../../components/ui/Button'
import { TextField } from '../../components/ui/TextField'
import { AuthLayout } from '../../layouts/AuthLayout'
import { authService } from '../../services/auth.service'
import { ApiError } from '../../services/http'

import './PasswordReset.css'

const forgotPasswordSchema = z.object({
  email: z.string().min(1, 'Ingresa tu correo').email('Ingresa un correo válido'),
})

type ForgotPasswordFormValues = z.infer<typeof forgotPasswordSchema>

export function ForgotPasswordPage() {
  const [submitted, setSubmitted] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ForgotPasswordFormValues>({
    resolver: zodResolver(forgotPasswordSchema),
  })

  const onSubmit = async (values: ForgotPasswordFormValues) => {
    setFormError(null)
    try {
      await authService.forgotPassword(values)
      setSubmitted(true)
    } catch (error) {
      setFormError(
        error instanceof ApiError
          ? error.message
          : 'No pudimos conectar con el servidor. Intenta de nuevo.',
      )
    }
  }

  return (
    <AuthLayout
      tagline="Recupera el acceso a tu cuenta de forma segura."
      back={{ to: '/login', label: '← Ir a iniciar sesión' }}
    >
      <p className="auth-layout__eyebrow">Recuperación de cuenta</p>
      <h1 className="auth-layout__title">¿Olvidaste tu contraseña?</h1>

      {submitted ? (
        <>
          <div className="password-reset__alert">
            <Alert tone="success">
              Si existe una cuenta con ese correo, recibirás un enlace para restablecer la
              contraseña. Revisa también la carpeta de correo no deseado.
            </Alert>
          </div>
          <Button fullWidth onClick={() => setSubmitted(false)}>
            Intentar con otro correo
          </Button>
        </>
      ) : (
        <>
          <p className="auth-layout__hint">
            Escribe el correo asociado a tu cuenta y te enviaremos un enlace de recuperación.
          </p>
          {formError && (
            <div className="password-reset__alert">
              <Alert tone="error">{formError}</Alert>
            </div>
          )}
          <form className="password-reset__form" onSubmit={handleSubmit(onSubmit)} noValidate>
            <TextField
              id="email"
              label="Correo electrónico"
              type="email"
              autoComplete="email"
              error={errors.email?.message}
              {...register('email')}
            />
            <Button type="submit" fullWidth disabled={isSubmitting}>
              {isSubmitting ? 'Enviando...' : 'Enviar enlace'}
            </Button>
          </form>
        </>
      )}
    </AuthLayout>
  )
}
