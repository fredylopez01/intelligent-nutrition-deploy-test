import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'

import { useAuth } from '../../hooks/useAuth'
import { ApiError } from '../../services/http'
import { usersService } from '../../services/users.service'
import type { User } from '../../types/user'
import { Alert } from '../ui/Alert'
import { Button } from '../ui/Button'
import { TextField } from '../ui/TextField'

const personalDataSchema = z.object({
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
  phone: z.string().trim().max(30, 'El teléfono no puede superar 30 caracteres'),
  address: z.string().trim().max(255, 'La dirección no puede superar 255 caracteres'),
})

type PersonalDataValues = z.infer<typeof personalDataSchema>

interface UserPersonalDataFormProps {
  user: User
  onSaved: () => void
}

function resolveErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 409) return 'Ese correo ya está registrado en otra cuenta.'
    if (error.status === 404) return 'El usuario ya no existe. Vuelve al listado.'
    if (error.status === 403) return 'No tienes permiso para actualizar esta cuenta.'
    return error.message
  }
  return 'No fue posible guardar los cambios. Intenta de nuevo.'
}

export function UserPersonalDataForm({ user, onSaved }: UserPersonalDataFormProps) {
  const { token } = useAuth()
  const [feedback, setFeedback] = useState<{ tone: 'success' | 'error'; text: string } | null>(null)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<PersonalDataValues>({
    resolver: zodResolver(personalDataSchema),
    values: {
      firstName: user.person.firstName ?? '',
      lastName: user.person.lastName ?? '',
      email: user.person.email ?? '',
      phone: user.person.phone ?? '',
      address: user.person.address ?? '',
    },
  })

  const onSubmit = async (values: PersonalDataValues) => {
    setFeedback(null)
    const next = {
      firstName: values.firstName.trim(),
      lastName: values.lastName.trim(),
      email: values.email.trim().toLowerCase(),
      phone: values.phone.trim(),
      address: values.address.trim(),
    }
    const current = {
      firstName: user.person.firstName ?? '',
      lastName: user.person.lastName ?? '',
      email: user.person.email ?? '',
      phone: user.person.phone ?? '',
      address: user.person.address ?? '',
    }
    const person = Object.fromEntries(
      (Object.keys(next) as Array<keyof typeof next>)
        .filter((key) => next[key] !== current[key])
        .map((key) => [key, next[key]]),
    )

    if (Object.keys(person).length === 0) {
      setFeedback({ tone: 'error', text: 'No hay cambios por guardar.' })
      return
    }

    try {
      await usersService.update(user.id, { person }, token)
      setFeedback({ tone: 'success', text: 'Los datos se guardaron correctamente.' })
      onSaved()
    } catch (error) {
      setFeedback({ tone: 'error', text: resolveErrorMessage(error) })
    }
  }

  return (
    <form className="user-page__form" onSubmit={handleSubmit(onSubmit)} noValidate>
      {feedback && <Alert tone={feedback.tone}>{feedback.text}</Alert>}

      <div className="user-page__form-row">
        <TextField
          id="user-firstName"
          label="Nombres"
          autoComplete="given-name"
          error={errors.firstName?.message}
          {...register('firstName')}
        />
        <TextField
          id="user-lastName"
          label="Apellidos"
          autoComplete="family-name"
          error={errors.lastName?.message}
          {...register('lastName')}
        />
      </div>

      <TextField
        id="user-email"
        label="Correo electrónico"
        type="email"
        autoComplete="email"
        hint="Si cambias el correo, el usuario debe iniciar sesión con el nuevo."
        error={errors.email?.message}
        {...register('email')}
      />

      <div className="user-page__form-row">
        <TextField
          id="user-phone"
          label="Teléfono"
          autoComplete="tel"
          placeholder="Sin registrar"
          error={errors.phone?.message}
          {...register('phone')}
        />
        <TextField
          id="user-address"
          label="Dirección"
          autoComplete="street-address"
          placeholder="Sin registrar"
          error={errors.address?.message}
          {...register('address')}
        />
      </div>

      <div className="user-page__form-actions">
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Guardando...' : 'Guardar cambios'}
        </Button>
      </div>
    </form>
  )
}
