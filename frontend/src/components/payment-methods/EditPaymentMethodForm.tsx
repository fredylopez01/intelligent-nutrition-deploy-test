import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { useForm } from 'react-hook-form'

import { useAuth } from '../../hooks/useAuth'
import { paymentMethodsService } from '../../services/paymentMethods.service'
import type { PaymentMethod } from '../../types/paymentMethod'
import {
  editPaymentMethodSchema,
  paymentMethodConflict,
  resolvePaymentMethodError,
  type EditPaymentMethodValues,
} from '../../utils/paymentMethods'
import { Alert } from '../ui/Alert'
import { Button } from '../ui/Button'
import { TextField } from '../ui/TextField'

import '../categories/CategoryForm.css'
import '../categories/CategoriesTable.css'
import './PaymentMethodForm.css'

interface EditPaymentMethodFormProps {
  paymentMethod: PaymentMethod
  onUpdated: (paymentMethod: PaymentMethod) => void
  onCancel: () => void
}

export function EditPaymentMethodForm({
  paymentMethod,
  onUpdated,
  onCancel,
}: EditPaymentMethodFormProps) {
  const { token } = useAuth()
  const [submitError, setSubmitError] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<EditPaymentMethodValues>({
    resolver: zodResolver(editPaymentMethodSchema),
    values: { name: paymentMethod.name },
  })

  const onSubmit = async (values: EditPaymentMethodValues) => {
    setSubmitError(null)
    if (values.name === paymentMethod.name) {
      setSubmitError('No hay cambios por guardar.')
      return
    }
    try {
      const updated = await paymentMethodsService.update(
        paymentMethod.id,
        { name: values.name },
        token,
      )
      onUpdated({ ...paymentMethod, ...updated })
    } catch (error) {
      const conflict = paymentMethodConflict(error)
      if (conflict?.field === 'name') {
        setError('name', { message: conflict.message }, { shouldFocus: true })
        return
      }
      setSubmitError(
        resolvePaymentMethodError(error, 'No fue posible guardar los cambios. Intenta de nuevo.'),
      )
    }
  }

  return (
    <form className="category-form" onSubmit={handleSubmit(onSubmit)} noValidate>
      {submitError && <Alert tone="error">{submitError}</Alert>}

      <div className="payment-method-form__locked">
        <span className="payment-method-form__locked-label">Código</span>
        <span className="units-table__abbreviation payment-method-form__locked-value">
          {paymentMethod.code}
        </span>
        <span className="ui-field__hint">
          El código no se puede cambiar porque identifica el método en las ventas registradas.
        </span>
      </div>

      <TextField
        id="edit-payment-method-name"
        label="Nombre"
        autoComplete="off"
        hint="Las ventas anteriores mostrarán el nuevo nombre."
        error={errors.name?.message}
        {...register('name')}
      />

      <div className="category-form__actions">
        <Button variant="outline" onClick={onCancel} disabled={isSubmitting}>
          Cancelar
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Guardando...' : 'Guardar cambios'}
        </Button>
      </div>
    </form>
  )
}
