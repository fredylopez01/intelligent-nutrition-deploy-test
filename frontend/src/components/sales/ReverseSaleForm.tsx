import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'

import { useAuth } from '../../hooks/useAuth'
import { salesService } from '../../services/sales.service'
import type { Sale } from '../../types/sale'
import { formatPrice } from '../../utils/products'
import {
  REVERSAL_REASON_MAX_LENGTH,
  REVERSAL_REASON_MIN_LENGTH,
  resolveSaleError,
  reverseSaleSchema,
  type ReverseSaleValues,
} from '../../utils/sales'
import { Alert } from '../ui/Alert'
import { Button } from '../ui/Button'
import { TextAreaField } from '../ui/TextAreaField'

import './Sales.css'

interface ReverseSaleFormProps {
  sale: Sale
  onReversed: (sale: Sale) => void
  onCancel: () => void
}

export function ReverseSaleForm({ sale, onReversed, onCancel }: ReverseSaleFormProps) {
  const { token } = useAuth()
  const [submitError, setSubmitError] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    control,
    formState: { errors, isSubmitting },
  } = useForm<ReverseSaleValues>({
    resolver: zodResolver(reverseSaleSchema),
    defaultValues: { reason: '' },
  })
  const reason = useWatch({ control, name: 'reason' })
  const units = sale.items.reduce((sum, item) => sum + item.quantity, 0)

  const onSubmit = async (values: ReverseSaleValues) => {
    setSubmitError(null)
    try {
      onReversed(await salesService.reverse(sale.id, values.reason, token))
    } catch (error) {
      setSubmitError(resolveSaleError(error, 'No fue posible reversar la venta. Intenta de nuevo.'))
    }
  }

  return (
    <form className="reverse-sale" onSubmit={handleSubmit(onSubmit)} noValidate>
      <Alert tone="info">
        La venta {sale.saleNumber} por {formatPrice(sale.total)} quedará como reversada y{' '}
        {units === 1
          ? 'la unidad vuelve al lote de donde salió'
          : `las ${units} unidades vuelven a los lotes de donde salieron`}{' '}
        en {sale.branch.name}. La venta no se borra del historial.
      </Alert>
      {submitError && <Alert tone="error">{submitError}</Alert>}
      <TextAreaField
        id="reverse-reason"
        label="Motivo de la reversión"
        rows={3}
        maxLength={REVERSAL_REASON_MAX_LENGTH}
        length={reason.length}
        placeholder="Ej. El cliente recibió el sabor equivocado"
        hint={`Mínimo ${REVERSAL_REASON_MIN_LENGTH} caracteres. Queda en la venta y en la auditoría.`}
        error={errors.reason?.message}
        {...register('reason')}
      />
      <div className="reverse-sale__actions">
        <Button variant="outline" onClick={onCancel} disabled={isSubmitting}>
          Cancelar
        </Button>
        <Button type="submit" variant="danger" disabled={isSubmitting}>
          {isSubmitting ? 'Reversando...' : 'Reversar venta'}
        </Button>
      </div>
    </form>
  )
}
