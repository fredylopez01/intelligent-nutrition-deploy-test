import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'

import { useAuth } from '../../hooks/useAuth'
import { inventoryService } from '../../services/inventory.service'
import type { BranchInventoryItem, MinimumStockResult } from '../../types/inventory'
import {
  formatQuantity,
  minimumStockSchema,
  resolveInventoryError,
  type MinimumStockValues,
} from '../../utils/inventory'
import { Alert } from '../ui/Alert'
import { Button } from '../ui/Button'
import { TextField } from '../ui/TextField'

import './MinimumStockForm.css'

interface MinimumStockFormProps {
  branchId: string
  item: BranchInventoryItem
  onSaved: (result: MinimumStockResult) => void
  onCancel: () => void
}

export function MinimumStockForm({ branchId, item, onSaved, onCancel }: MinimumStockFormProps) {
  const { token } = useAuth()
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [noChanges, setNoChanges] = useState(false)
  const currentMinimum = item.minimumStock ?? 0
  const abbreviation = item.product.unitOfMeasure.abbreviation
  const {
    register,
    handleSubmit,
    control,
    formState: { errors, isSubmitting },
  } = useForm<MinimumStockValues>({
    resolver: zodResolver(minimumStockSchema),
    defaultValues: { minimumStock: String(currentMinimum) },
  })
  const draft = useWatch({ control, name: 'minimumStock' })
  const draftValue = /^\d{1,9}$/.test(draft.trim()) ? Number(draft.trim()) : null
  const willBeLow = draftValue !== null && item.totalQuantity < draftValue

  const onSubmit = async ({ minimumStock }: MinimumStockValues) => {
    setSubmitError(null)
    const value = Number(minimumStock)
    if (value === currentMinimum) {
      setNoChanges(true)
      return
    }
    setNoChanges(false)
    try {
      const result = await inventoryService.updateMinimumStock(
        branchId,
        item.product.id,
        value,
        token,
      )
      onSaved(result)
    } catch (error) {
      setSubmitError(
        resolveInventoryError(error, 'No fue posible guardar el stock mínimo. Intenta de nuevo.'),
      )
    }
  }

  return (
    <form className="minimum-form" onSubmit={handleSubmit(onSubmit)} noValidate>
      {submitError && <Alert tone="error">{submitError}</Alert>}
      {noChanges && <Alert tone="info">No hay cambios por guardar.</Alert>}

      <dl className="minimum-form__facts">
        <div>
          <dt>Existencias en la sede</dt>
          <dd>{formatQuantity(item.totalQuantity, abbreviation)}</dd>
        </div>
        <div>
          <dt>Stock mínimo actual</dt>
          <dd>{formatQuantity(currentMinimum, abbreviation)}</dd>
        </div>
      </dl>

      <TextField
        id="minimum-stock"
        label="Nuevo stock mínimo"
        inputMode="numeric"
        autoComplete="off"
        hint="Se aplica a todos los lotes del producto en esta sede. No cambia las existencias."
        error={errors.minimumStock?.message}
        {...register('minimumStock', { onChange: () => setNoChanges(false) })}
      />

      {draftValue !== null && (
        <p
          className={`minimum-form__preview${willBeLow ? ' minimum-form__preview--low' : ''}`}
          role="status"
        >
          {willBeLow
            ? `Con este mínimo el producto quedará bajo mínimo: hay ${formatQuantity(item.totalQuantity, abbreviation)} y el mínimo sería ${formatQuantity(draftValue, abbreviation)}.`
            : 'Con este mínimo el producto queda en nivel.'}
        </p>
      )}

      <div className="minimum-form__actions">
        <Button variant="outline" onClick={onCancel} disabled={isSubmitting}>
          Cancelar
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Guardando...' : 'Guardar stock mínimo'}
        </Button>
      </div>
    </form>
  )
}
