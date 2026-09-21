import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'

import { useAuth } from '../../hooks/useAuth'
import { useRoles } from '../../hooks/useRoles'
import { ApiError } from '../../services/http'
import { usersService } from '../../services/users.service'
import { getRoleLabel } from '../../utils/format'
import { Alert } from '../ui/Alert'
import { Button } from '../ui/Button'
import { SelectField } from '../ui/SelectField'
import { TextField } from '../ui/TextField'

import './UserForm.css'

const createUserSchema = z.object({
  fullName: z
    .string()
    .trim()
    .min(1, 'Ingresa el nombre completo')
    .max(150, 'El nombre no puede superar 150 caracteres'),
  email: z
    .string()
    .trim()
    .min(1, 'Ingresa el correo electrónico')
    .email('Ingresa un correo válido')
    .max(150, 'El correo no puede superar 150 caracteres'),
  roleId: z.string().min(1, 'Selecciona un rol'),
})

type CreateUserFormValues = z.infer<typeof createUserSchema>
interface CreateUserFormProps {
  onCreated: () => void
  onCancel: () => void
}

function resolveErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 409) return 'Ese correo ya está registrado en otra cuenta.'
    if (error.status === 404) return 'El rol seleccionado ya no existe. Vuelve a elegirlo.'
    if (error.status === 403) return 'Solo un Superadmin puede registrar usuarios.'
    if (error.status === 500) {
      return 'El usuario quedó creado, pero no se pudo enviar el correo de activación. Reenvíalo desde el listado.'
    }

    return error.message
  }

  return 'No fue posible registrar el usuario. Intenta de nuevo.'
}

export function CreateUserForm({ onCreated, onCancel }: CreateUserFormProps) {
  const { token } = useAuth()
  const { roles, isLoading: rolesLoading, error: rolesError } = useRoles()
  const [submitError, setSubmitError] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<CreateUserFormValues>({
    resolver: zodResolver(createUserSchema),
    defaultValues: { fullName: '', email: '', roleId: '' },
  })

  const onSubmit = async (values: CreateUserFormValues) => {
    setSubmitError(null)
    try {
      await usersService.create(
        {
          fullName: values.fullName.trim(),
          email: values.email.trim().toLowerCase(),
          roleId: values.roleId,
        },
        token,
      )
      onCreated()
    } catch (error) {
      setSubmitError(resolveErrorMessage(error))
    }
  }

  const roleOptions = roles
    .filter((role) => role.active !== false)
    .map((role) => ({ value: role.id, label: getRoleLabel(role.name) }))
  return (
    <form className="user-form" onSubmit={handleSubmit(onSubmit)} noValidate>
      {submitError && <Alert tone="error">{submitError}</Alert>}
      <TextField
        id="create-user-fullName"
        label="Nombre completo"
        placeholder="Ej. Yulieth Tarazona"
        autoComplete="name"
        error={errors.fullName?.message}
        {...register('fullName')}
      />
      <TextField
        id="create-user-email"
        label="Correo electrónico"
        type="email"
        placeholder="nombre.apellido@intelligent.co"
        autoComplete="email"
        hint="A este correo llega el enlace para activar la cuenta y definir la contraseña."
        error={errors.email?.message}
        {...register('email')}
      />
      {rolesError ? (
        <Alert tone="error">
          No fue posible cargar los roles disponibles. Cierra el formulario y vuelve a intentarlo.
        </Alert>
      ) : (
        <SelectField
          id="create-user-roleId"
          label="Rol"
          placeholder={rolesLoading ? 'Cargando roles...' : 'Selecciona un rol'}
          options={roleOptions}
          disabled={rolesLoading}
          error={errors.roleId?.message}
          {...register('roleId')}
        />
      )}
      <div className="user-form__actions">
        <Button variant="outline" onClick={onCancel} disabled={isSubmitting}>
          Cancelar
        </Button>
        <Button type="submit" disabled={isSubmitting || rolesLoading || !!rolesError}>
          {isSubmitting ? 'Registrando...' : 'Registrar usuario'}
        </Button>
      </div>
    </form>
  )
}
