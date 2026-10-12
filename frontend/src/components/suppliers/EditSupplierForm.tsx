import { zodResolver } from '@hookform/resolvers/zod'
import { useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'

import { useAuth } from '../../hooks/useAuth'
import { useDocumentTypes } from '../../hooks/useDocumentTypes'
import { ApiError } from '../../services/http'
import { suppliersService } from '../../services/suppliers.service'
import type { Supplier, UpdateSupplierPersonPayload } from '../../types/supplier'
import {
  PERSON_KIND_DOCUMENT_CODES,
  contactFields,
  validateDocumentNumber,
} from '../../utils/persons'
import { getSupplierKind, getSupplierName } from '../../utils/suppliers'
import type { SupplierKind } from '../../utils/suppliers'
import { Alert } from '../ui/Alert'
import { Button } from '../ui/Button'
import { SelectField } from '../ui/SelectField'
import { TextField } from '../ui/TextField'

import './SupplierForm.css'

function buildSchema(kind: SupplierKind, codeById: Map<string, string>) {
  return z
    .object({
      documentTypeId: z.string().min(1, 'Selecciona un tipo de documento'),
      documentNumber: z
        .string()
        .trim()
        .min(1, 'Ingresa el número de documento')
        .max(50, 'El número de documento no puede superar 50 caracteres'),
      businessName: z.string().trim().max(200, 'La razón social no puede superar 200 caracteres'),
      firstName: z.string().trim().max(100, 'Los nombres no pueden superar 100 caracteres'),
      lastName: z.string().trim().max(100, 'Los apellidos no pueden superar 100 caracteres'),
      ...contactFields,
      commercialName: z
        .string()
        .trim()
        .min(1, 'Ingresa el nombre comercial')
        .max(200, 'El nombre comercial no puede superar 200 caracteres'),
    })
    .superRefine((values, context) => {
      const documentError = validateDocumentNumber(
        codeById.get(values.documentTypeId),
        values.documentNumber.trim(),
      )
      if (documentError) {
        context.addIssue({ code: 'custom', path: ['documentNumber'], message: documentError })
      }
      if (kind === 'empresa') {
        if (!values.businessName.trim()) {
          context.addIssue({
            code: 'custom',
            path: ['businessName'],
            message: 'Ingresa la razón social',
          })
        }
        return
      }
      if (!values.firstName.trim()) {
        context.addIssue({ code: 'custom', path: ['firstName'], message: 'Ingresa los nombres' })
      }
      if (!values.lastName.trim()) {
        context.addIssue({ code: 'custom', path: ['lastName'], message: 'Ingresa los apellidos' })
      }
    })
}

type EditSupplierValues = z.infer<ReturnType<typeof buildSchema>>

const CONTACT_FIELDS = ['email', 'phone', 'address'] as const

interface EditSupplierFormProps {
  supplier: Supplier
  onUpdated: () => void
  onCancel: () => void
}

function resolveErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.code === 'DOCUMENT_ALREADY_IN_USE') {
      return 'Ese documento ya pertenece a otra persona registrada.'
    }
    if (error.code === 'EMAIL_ALREADY_IN_USE') {
      return 'Ese correo ya pertenece a otra persona registrada. Usa un correo diferente.'
    }
    if (error.status === 403) return 'No tienes permiso para editar proveedores.'
    if (error.status === 404) return 'Este proveedor ya no existe. Recarga el listado.'
    if (error.status === 400) return 'Revisa los datos: hay un campo que el servidor no aceptó.'
    return error.message
  }

  return 'No fue posible guardar los cambios. Intenta de nuevo.'
}

function toValues(supplier: Supplier): EditSupplierValues {
  const { person } = supplier
  return {
    documentTypeId: person.documentTypeId ?? '',
    documentNumber: person.documentNumber ?? '',
    businessName: person.businessName ?? '',
    firstName: person.firstName ?? '',
    lastName: person.lastName ?? '',
    email: person.email ?? '',
    phone: person.phone ?? '',
    address: person.address ?? '',
    commercialName: supplier.commercialName ?? '',
  }
}

export function EditSupplierForm({ supplier, onUpdated, onCancel }: EditSupplierFormProps) {
  const { token } = useAuth()
  const { documentTypes, isLoading: docTypesLoading, error: docTypesError } = useDocumentTypes()
  const [submitError, setSubmitError] = useState<string | null>(null)

  const kind = getSupplierKind(supplier)
  const kindDocumentTypes = useMemo(
    () =>
      documentTypes.filter(
        (documentType) =>
          PERSON_KIND_DOCUMENT_CODES[kind].includes(documentType.code) &&
          (documentType.active || documentType.id === supplier.person.documentTypeId),
      ),
    [documentTypes, kind, supplier.person.documentTypeId],
  )
  const codeById = useMemo(
    () => new Map(kindDocumentTypes.map((documentType) => [documentType.id, documentType.code])),
    [kindDocumentTypes],
  )
  const schema = useMemo(() => buildSchema(kind, codeById), [kind, codeById])
  const current = toValues(supplier)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<EditSupplierValues>({
    resolver: zodResolver(schema),
    values: current,
  })

  const onSubmit = async (values: EditSupplierValues) => {
    setSubmitError(null)
    const person: UpdateSupplierPersonPayload = {}

    const documentNumber = values.documentNumber.trim()
    if (
      values.documentTypeId !== current.documentTypeId ||
      documentNumber !== current.documentNumber
    ) {
      person.documentTypeId = values.documentTypeId
      person.documentNumber = documentNumber
    }

    const names =
      kind === 'empresa'
        ? { businessName: values.businessName.trim() }
        : { firstName: values.firstName.trim(), lastName: values.lastName.trim() }
    for (const [key, value] of Object.entries(names) as Array<[keyof typeof names, string]>) {
      if (value !== current[key]) person[key] = value
    }

    for (const key of CONTACT_FIELDS) {
      const value = key === 'email' ? values.email.trim().toLowerCase() : values[key].trim()
      if (value !== current[key]) person[key] = value
    }

    const commercialName = values.commercialName.trim()
    const hasPersonChanges = Object.keys(person).length > 0
    const hasCommercialChange = commercialName !== current.commercialName

    if (!hasPersonChanges && !hasCommercialChange) {
      setSubmitError('No hay cambios por guardar.')
      return
    }

    try {
      await suppliersService.update(
        supplier.id,
        {
          ...(hasPersonChanges ? { person } : {}),
          ...(hasCommercialChange ? { commercialName } : {}),
        },
        token,
      )
      onUpdated()
    } catch (error) {
      setSubmitError(resolveErrorMessage(error))
    }
  }

  const docTypeOptions = kindDocumentTypes.map((documentType) => ({
    value: documentType.id,
    label: documentType.name,
  }))

  return (
    <form className="supplier-form" onSubmit={handleSubmit(onSubmit)} noValidate>
      {submitError && <Alert tone="error">{submitError}</Alert>}

      <p className="supplier-form__note">
        Editas los datos de <strong>{getSupplierName(supplier)}</strong> (
        {kind === 'empresa' ? 'empresa' : 'persona natural'}). Si esta persona también es cliente o
        usuario, los cambios de identificación y contacto se reflejan allí.
      </p>

      <p className="supplier-form__section-title">Identificación</p>

      <div className="supplier-form__row">
        {docTypesError ? (
          <Alert tone="error">No fue posible cargar los tipos de documento.</Alert>
        ) : (
          <SelectField
            id="edit-supplier-documentTypeId"
            label="Tipo de documento"
            placeholder={docTypesLoading ? 'Cargando...' : 'Selecciona'}
            options={docTypeOptions}
            disabled={docTypesLoading}
            error={errors.documentTypeId?.message}
            {...register('documentTypeId')}
          />
        )}
        <TextField
          id="edit-supplier-documentNumber"
          label="Número de documento"
          autoComplete="off"
          error={errors.documentNumber?.message}
          {...register('documentNumber')}
        />
      </div>

      {kind === 'empresa' ? (
        <TextField
          id="edit-supplier-businessName"
          label="Razón social"
          autoComplete="organization"
          error={errors.businessName?.message}
          {...register('businessName')}
        />
      ) : (
        <div className="supplier-form__row">
          <TextField
            id="edit-supplier-firstName"
            label="Nombres"
            autoComplete="off"
            error={errors.firstName?.message}
            {...register('firstName')}
          />
          <TextField
            id="edit-supplier-lastName"
            label="Apellidos"
            autoComplete="off"
            error={errors.lastName?.message}
            {...register('lastName')}
          />
        </div>
      )}

      <p className="supplier-form__section-title">Contacto</p>

      <div className="supplier-form__row">
        <TextField
          id="edit-supplier-email"
          label="Correo electrónico"
          type="email"
          autoComplete="email"
          error={errors.email?.message}
          {...register('email')}
        />
        <TextField
          id="edit-supplier-phone"
          label="Teléfono"
          autoComplete="tel"
          inputMode="numeric"
          error={errors.phone?.message}
          {...register('phone')}
        />
      </div>

      <TextField
        id="edit-supplier-address"
        label="Dirección"
        autoComplete="street-address"
        error={errors.address?.message}
        {...register('address')}
      />

      <p className="supplier-form__section-title">Datos del proveedor</p>

      <TextField
        id="edit-supplier-commercialName"
        label="Nombre comercial"
        autoComplete="off"
        error={errors.commercialName?.message}
        {...register('commercialName')}
      />

      <div className="supplier-form__actions">
        <Button variant="outline" type="button" onClick={onCancel} disabled={isSubmitting}>
          Cancelar
        </Button>
        <Button type="submit" disabled={isSubmitting || docTypesLoading}>
          {isSubmitting ? 'Guardando...' : 'Guardar cambios'}
        </Button>
      </div>
    </form>
  )
}
