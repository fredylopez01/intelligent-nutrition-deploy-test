import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { useForm } from 'react-hook-form'

import { useAuth } from '../../hooks/useAuth'
import { paymentMethodsService } from '../../services/paymentMethods.service'
import type { PaymentMethod } from '../../types/paymentMethod'
import {
  createPaymentMethodSchema,
  paymentMethodConflict,
  resolvePaymentMethodError,
  type CreatePaymentMethodData,
  type CreatePaymentMethodValues,
} from '../../utils/paymentMethods'
import { Alert } from '../ui/Alert'
import { Button } from '../ui/Button'
import { TextField } from '../ui/TextField'

import '../categories/CategoryForm.css'
import './PaymentMethodForm.css'

interface CreatePaymentMethodFormProps {
  onCreated: (paymentMethod: PaymentMethod) => void
  onCancel: () => void
}

export function CreatePaymentMethodForm({ onCreated, onCancel }: CreatePaymentMethodFormProps) {
  const { token } = useAuth()
  const [submitError, setSubmitError] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<CreatePaymentMethodValues, unknown, CreatePaymentMethodData>({
    resolver: zodResolver(createPaymentMethodSchema),
    defaultValues: { code: '', name: '' },
  })

  const onSubmit = async (values: CreatePaymentMethodData) => {
    setSubmitError(null)
    try {
      const paymentMethod = await paymentMethodsService.create(values, token)
      onCreated(paymentMethod)
    } catch (error) {
      const conflict = paymentMethodConflict(error)
      if (conflict) {
        setError(conflict.field, { message: conflict.message }, { shouldFocus: true })
        return
      }
      setSubmitError(
        resolvePaymentMethodError(
          error,
          'No fue posible registrar el método de pago. Intenta de nuevo.',
        ),
      )
    }
  }

  return (
    <form className="category-form" onSubmit={handleSubmit(onSubmit)} noValidate>
      {submitError && <Alert tone="error">{submitError}</Alert>}

      <div className="payment-method-form__code">
        <TextField
          id="create-payment-method-code"
          label="Código"
          placeholder="Ej. DAVIPLATA"
          autoComplete="off"
          spellCheck={false}
          hint="Hasta 30 caracteres: letras, números y guion bajo. Se guarda en mayúsculas y no se puede cambiar después."
          error={errors.code?.message}
          {...register('code')}
        />
      </div>
      <TextField
        id="create-payment-method-name"
        label="Nombre"
        placeholder="Ej. Daviplata"
        autoComplete="off"
        hint="Es el nombre que verá el cajero en el punto de venta."
        error={errors.name?.message}
        {...register('name')}
      />

      <p className="category-form__note">
        El método queda activo y disponible en el punto de venta al registrarlo.
      </p>

      <div className="category-form__actions">
        <Button variant="outline" onClick={onCancel} disabled={isSubmitting}>
          Cancelar
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Registrando...' : 'Registrar método'}
        </Button>
      </div>
    </form>
  )
}
