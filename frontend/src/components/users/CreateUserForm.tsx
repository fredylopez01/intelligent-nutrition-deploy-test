import { zodResolver } from '@hookform/resolvers/zod'
import { useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'

import { useAuth } from '../../hooks/useAuth'
import { useBranches } from '../../hooks/useBranches'
import { useDocumentTypes } from '../../hooks/useDocumentTypes'
import { useRoles } from '../../hooks/useRoles'
import { ApiError } from '../../services/http'
import { usersService } from '../../services/users.service'
import type { PersonSearchResult } from '../../types/person'
import { getRoleLabel } from '../../utils/format'
import { contactFields, prefillFromSearch, validateDocumentNumber } from '../../utils/persons'
import { PersonLookup } from '../persons/PersonLookup'
import { PersonSummary } from '../persons/PersonSummary'
import { Alert } from '../ui/Alert'
import { Button } from '../ui/Button'
import { SelectField } from '../ui/SelectField'
import { TextField } from '../ui/TextField'

import './UserForm.css'

const USER_DOCUMENT_CODES = ['CC', 'CE', 'PAS']

function buildSchema(codeById: Map<string, string>) {
  return z
    .object({
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
      ...contactFields,
      roleId: z.string().min(1, 'Selecciona un rol'),
    })
    .superRefine((values, context) => {
      const documentError = validateDocumentNumber(
        codeById.get(values.documentTypeId),
        values.documentNumber.trim(),
      )
      if (documentError) {
        context.addIssue({ code: 'custom', path: ['documentNumber'], message: documentError })
      }
    })
}

type CreateUserFormValues = z.infer<ReturnType<typeof buildSchema>>

interface CreateUserFormProps {
  onCreated: () => void
  onCancel: () => void
}

type Step =
  | { name: 'search' }
  | { name: 'existing'; person: PersonSearchResult }
  | { name: 'new'; initialValues: { documentNumber?: string; email?: string } }

function resolveErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.code === 'EMAIL_ALREADY_IN_USE') {
      return 'Ese correo ya pertenece a otra persona registrada. Búscala o usa otro correo.'
    }
    if (error.status === 409) return 'Esta persona ya tiene una cuenta de usuario.'
    if (error.status === 404) {
      return 'La persona, el rol o la sede ya no existe o está inactiva. Vuelve a elegirla.'
    }
    if (error.status === 403) return 'No tienes permiso para registrar usuarios.'
    if (error.status === 400) return 'Revisa los datos: hay un campo que el servidor no aceptó.'
    return error.message
  }
  return 'No fue posible registrar el usuario. Intenta de nuevo.'
}

export function CreateUserForm({ onCreated, onCancel }: CreateUserFormProps) {
  const [step, setStep] = useState<Step>({ name: 'search' })

  if (step.name === 'existing') {
    return (
      <ExistingPersonStep
        person={step.person}
        onCreated={onCreated}
        onBack={() => setStep({ name: 'search' })}
        onCancel={onCancel}
      />
    )
  }

  if (step.name === 'new') {
    return (
      <NewUserForm
        initialValues={step.initialValues}
        onCreated={onCreated}
        onBack={() => setStep({ name: 'search' })}
        onCancel={onCancel}
      />
    )
  }

  return (
    <PersonLookup
      target="user"
      onSelect={(person) => setStep({ name: 'existing', person })}
      onCreateNew={(term) => setStep({ name: 'new', initialValues: prefillFromSearch(term) })}
      onCancel={onCancel}
    />
  )
}

interface BranchPickerProps {
  selectedIds: string[]
  onToggle: (branchId: string) => void
}

function BranchPicker({ selectedIds, onToggle }: BranchPickerProps) {
  const { branches, status } = useBranches({ limit: 100, active: true })

  return (
    <fieldset className="user-form__branches">
      <legend className="user-form__branches-legend">Sedes (opcional)</legend>
      {status === 'loading' && <p className="user-form__branches-hint">Cargando sedes...</p>}
      {status === 'error' && (
        <p className="user-form__branches-hint">No fue posible cargar las sedes.</p>
      )}
      {status === 'success' && branches.length === 0 && (
        <p className="user-form__branches-hint">
          Todavía no hay sedes activas. Puedes asignarlas más adelante.
        </p>
      )}
      {branches.map((branch) => (
        <label className="user-form__branch" key={branch.id}>
          <input
            type="checkbox"
            checked={selectedIds.includes(branch.id)}
            onChange={() => onToggle(branch.id)}
          />
          <span>{branch.name}</span>
        </label>
      ))}
    </fieldset>
  )
}

function useBranchSelection() {
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const toggle = (branchId: string) => {
    setSelectedIds((current) =>
      current.includes(branchId) ? current.filter((id) => id !== branchId) : [...current, branchId],
    )
  }
  return { selectedIds, toggle }
}

function useRoleOptions() {
  const { roles, isLoading, error } = useRoles()
  const options = roles
    .filter((role) => role.active !== false)
    .map((role) => ({ value: role.id, label: getRoleLabel(role.name) }))
  return { options, isLoading, error }
}

interface ExistingPersonStepProps extends CreateUserFormProps {
  person: PersonSearchResult
  onBack: () => void
}

function ExistingPersonStep({ person, onCreated, onBack, onCancel }: ExistingPersonStepProps) {
  const { token } = useAuth()
  const { options: roleOptions, isLoading: rolesLoading, error: rolesError } = useRoleOptions()
  const branchSelection = useBranchSelection()
  const [roleId, setRoleId] = useState('')
  const [roleError, setRoleError] = useState<string | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleConfirm = async () => {
    if (!roleId) {
      setRoleError('Selecciona un rol')
      return
    }
    setSubmitError(null)
    setIsSubmitting(true)
    try {
      await usersService.create(
        {
          personId: person.id,
          roleId,
          ...(branchSelection.selectedIds.length > 0
            ? { branchIds: branchSelection.selectedIds }
            : {}),
        },
        token,
      )
      onCreated()
    } catch (error) {
      setSubmitError(resolveErrorMessage(error))
      setIsSubmitting(false)
    }
  }

  return (
    <div className="user-form">
      {submitError && <Alert tone="error">{submitError}</Alert>}
      <PersonSummary person={person} onChange={onBack} disabled={isSubmitting} />
      <p className="user-form__note">
        El enlace de activación llegará a {person.email}. Si el correo cambió, actualízalo después
        desde el detalle del usuario.
      </p>

      <p className="user-form__section-title">Acceso</p>
      {rolesError ? (
        <Alert tone="error">No fue posible cargar los roles disponibles.</Alert>
      ) : (
        <SelectField
          id="existing-user-roleId"
          label="Rol"
          placeholder={rolesLoading ? 'Cargando roles...' : 'Selecciona un rol'}
          options={roleOptions}
          disabled={rolesLoading}
          value={roleId}
          error={roleError ?? undefined}
          onChange={(event) => {
            setRoleId(event.target.value)
            setRoleError(null)
          }}
        />
      )}
      <BranchPicker selectedIds={branchSelection.selectedIds} onToggle={branchSelection.toggle} />

      <div className="user-form__actions">
        <Button variant="outline" onClick={onCancel} disabled={isSubmitting}>
          Cancelar
        </Button>
        <Button
          onClick={() => void handleConfirm()}
          disabled={isSubmitting || rolesLoading || !!rolesError}
        >
          {isSubmitting ? 'Registrando...' : 'Registrar usuario'}
        </Button>
      </div>
    </div>
  )
}

interface NewUserFormProps extends CreateUserFormProps {
  initialValues: { documentNumber?: string; email?: string }
  onBack: () => void
}

function NewUserForm({ initialValues, onCreated, onBack, onCancel }: NewUserFormProps) {
  const { token } = useAuth()
  const { options: roleOptions, isLoading: rolesLoading, error: rolesError } = useRoleOptions()
  const { documentTypes, isLoading: docTypesLoading, error: docTypesError } = useDocumentTypes()
  const branchSelection = useBranchSelection()
  const [submitError, setSubmitError] = useState<string | null>(null)

  const personDocumentTypes = useMemo(
    () =>
      documentTypes.filter(
        (documentType) => documentType.active && USER_DOCUMENT_CODES.includes(documentType.code),
      ),
    [documentTypes],
  )
  const codeById = useMemo(
    () => new Map(personDocumentTypes.map((documentType) => [documentType.id, documentType.code])),
    [personDocumentTypes],
  )
  const schema = useMemo(() => buildSchema(codeById), [codeById])

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<CreateUserFormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      documentTypeId: '',
      documentNumber: initialValues.documentNumber ?? '',
      firstName: '',
      lastName: '',
      email: initialValues.email ?? '',
      phone: '',
      address: '',
      roleId: '',
    },
  })

  const onSubmit = async (values: CreateUserFormValues) => {
    setSubmitError(null)

    try {
      await usersService.create(
        {
          person: {
            documentTypeId: values.documentTypeId,
            documentNumber: values.documentNumber.trim(),
            firstName: values.firstName.trim(),
            lastName: values.lastName.trim(),
            email: values.email.trim().toLowerCase(),
            phone: values.phone.trim(),
            address: values.address.trim(),
          },
          roleId: values.roleId,
          ...(branchSelection.selectedIds.length > 0
            ? { branchIds: branchSelection.selectedIds }
            : {}),
        },
        token,
      )
      onCreated()
    } catch (error) {
      setSubmitError(resolveErrorMessage(error))
    }
  }

  const docTypeOptions = personDocumentTypes.map((documentType) => ({
    value: documentType.id,
    label: documentType.name,
  }))

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
          label="Teléfono"
          placeholder="Ej. 3001234567"
          autoComplete="tel"
          inputMode="numeric"
          error={errors.phone?.message}
          {...register('phone')}
        />
        <TextField
          id="create-user-address"
          label="Dirección"
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

      <BranchPicker selectedIds={branchSelection.selectedIds} onToggle={branchSelection.toggle} />

      <div className="user-form__actions">
        <Button
          variant="ghost"
          className="user-form__back"
          onClick={onBack}
          disabled={isSubmitting}
        >
          ← Volver a buscar
        </Button>
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
