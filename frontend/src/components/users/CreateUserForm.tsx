import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'

import { useAuth } from '../../hooks/useAuth'
import { useBranches } from '../../hooks/useBranches'
import { useDocumentTypes } from '../../hooks/useDocumentTypes'
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
  documentTypeId: z.string().min(1, 'Selecciona un tipo de documento'),
  documentNumber: z
    .string()
    .trim()
    .min(1, 'Ingresa el número de documento')
    .max(50, 'El número de documento no puede superar 50 caracteres'),
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
  roleId: z.string().min(1, 'Selecciona un rol'),
})

type CreateUserFormValues = z.infer<typeof createUserSchema>

interface CreateUserFormProps {
  onCreated: () => void
  onCancel: () => void
}

function resolveErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 409) {
      return 'Ya existe una cuenta con ese correo o esa persona ya tiene usuario.'
    }
    if (error.status === 404)
      return 'El rol o la sede seleccionada ya no existe. Vuelve a elegirla.'
    if (error.status === 403) return 'No tienes permiso para registrar usuarios.'
    if (error.status === 422) return 'Revisa los datos: hay un campo que el servidor no aceptó.'
    return error.message
  }
  return 'No fue posible registrar el usuario. Intenta de nuevo.'
}

export function CreateUserForm({ onCreated, onCancel }: CreateUserFormProps) {
  const { token } = useAuth()
  const { roles, isLoading: rolesLoading, error: rolesError } = useRoles()
  const { documentTypes, isLoading: docTypesLoading, error: docTypesError } = useDocumentTypes()
  const { branches, status: branchesStatus } = useBranches({ limit: 100, active: true })
  const [selectedBranchIds, setSelectedBranchIds] = useState<string[]>([])
  const [submitError, setSubmitError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<CreateUserFormValues>({
    resolver: zodResolver(createUserSchema),
    defaultValues: {
      documentTypeId: '',
      documentNumber: '',
      firstName: '',
      lastName: '',
      email: '',
      phone: '',
      address: '',
      roleId: '',
    },
  })

  const toggleBranch = (branchId: string) => {
    setSelectedBranchIds((current) =>
      current.includes(branchId) ? current.filter((id) => id !== branchId) : [...current, branchId],
    )
  }

  const onSubmit = async (values: CreateUserFormValues) => {
    setSubmitError(null)
    const phone = values.phone?.trim()
    const address = values.address?.trim()

    try {
      await usersService.create(
        {
          person: {
            documentTypeId: values.documentTypeId,
            documentNumber: values.documentNumber.trim(),
            firstName: values.firstName.trim(),
            lastName: values.lastName.trim(),
            email: values.email.trim().toLowerCase(),
            ...(phone ? { phone } : {}),
            ...(address ? { address } : {}),
          },
          roleId: values.roleId,
          ...(selectedBranchIds.length > 0 ? { branchIds: selectedBranchIds } : {}),
        },
        token,
      )
      onCreated()
    } catch (error) {
      setSubmitError(resolveErrorMessage(error))
    }
  }

  const docTypeOptions = documentTypes
    .filter((documentType) => documentType.active)
    .map((documentType) => ({ value: documentType.id, label: documentType.name }))

  const roleOptions = roles
    .filter((role) => role.active !== false)
    .map((role) => ({ value: role.id, label: getRoleLabel(role.name) }))

  const blocked = rolesLoading || docTypesLoading || !!rolesError || !!docTypesError

  return (
    <form className="user-form" onSubmit={handleSubmit(onSubmit)} noValidate>
      {submitError && <Alert tone="error">{submitError}</Alert>}

      <p className="user-form__section-title">Datos de la persona</p>

      <div className="user-form__row">
        {docTypesError ? (
          <Alert tone="error">No fue posible cargar los tipos de documento.</Alert>
        ) : (
          <SelectField
            id="create-user-documentTypeId"
            label="Tipo de documento"
            placeholder={docTypesLoading ? 'Cargando...' : 'Selecciona'}
            options={docTypeOptions}
            disabled={docTypesLoading}
            error={errors.documentTypeId?.message}
            {...register('documentTypeId')}
          />
        )}
        <TextField
          id="create-user-documentNumber"
          label="Número de documento"
          placeholder="Ej. 1012345678"
          autoComplete="off"
          error={errors.documentNumber?.message}
          {...register('documentNumber')}
        />
      </div>

      <div className="user-form__row">
        <TextField
          id="create-user-firstName"
          label="Nombres"
          placeholder="Ej. Yulieth"
          autoComplete="given-name"
          error={errors.firstName?.message}
          {...register('firstName')}
        />
        <TextField
          id="create-user-lastName"
          label="Apellidos"
          placeholder="Ej. Tarazona"
          autoComplete="family-name"
          error={errors.lastName?.message}
          {...register('lastName')}
        />
      </div>

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

      <div className="user-form__row">
        <TextField
          id="create-user-phone"
          label="Teléfono (opcional)"
          placeholder="Ej. 3001234567"
          autoComplete="tel"
          error={errors.phone?.message}
          {...register('phone')}
        />
        <TextField
          id="create-user-address"
          label="Dirección (opcional)"
          placeholder="Ej. Calle 10 # 20-30"
          autoComplete="street-address"
          error={errors.address?.message}
          {...register('address')}
        />
      </div>

      <p className="user-form__section-title">Acceso</p>

      {rolesError ? (
        <Alert tone="error">No fue posible cargar los roles disponibles.</Alert>
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

      <fieldset className="user-form__branches">
        <legend className="user-form__branches-legend">Sedes (opcional)</legend>
        {branchesStatus === 'loading' && (
          <p className="user-form__branches-hint">Cargando sedes...</p>
        )}
        {branchesStatus === 'error' && (
          <p className="user-form__branches-hint">No fue posible cargar las sedes.</p>
        )}
        {branchesStatus === 'success' && branches.length === 0 && (
          <p className="user-form__branches-hint">
            Todavía no hay sedes activas. Puedes asignarlas más adelante.
          </p>
        )}
        {branches.map((branch) => (
          <label className="user-form__branch" key={branch.id}>
            <input
              type="checkbox"
              checked={selectedBranchIds.includes(branch.id)}
              onChange={() => toggleBranch(branch.id)}
            />
            <span>{branch.name}</span>
          </label>
        ))}
      </fieldset>

      <div className="user-form__actions">
        <Button variant="outline" onClick={onCancel} disabled={isSubmitting}>
          Cancelar
        </Button>
        <Button type="submit" disabled={isSubmitting || blocked}>
          {isSubmitting ? 'Registrando...' : 'Registrar usuario'}
        </Button>
      </div>
    </form>
  )
}
