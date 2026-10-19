import { useState } from 'react'

import { Alert } from './Alert'
import { Button } from './Button'

import './StatusConfirmation.css'

interface StatusConfirmationProps {
  active: boolean
  onConfirm: () => Promise<void>
  onCancel: () => void
  resolveError: (error: unknown) => string
}

export function StatusConfirmation({
  active,
  onConfirm,
  onCancel,
  resolveError,
}: StatusConfirmationProps) {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const targetActive = !active

  const handleConfirm = async () => {
    setSubmitError(null)
    setIsSubmitting(true)
    try {
      await onConfirm()
    } catch (error) {
      setSubmitError(resolveError(error))
      setIsSubmitting(false)
    }
  }

  return (
    <div className="ui-status-confirmation">
      {submitError && <Alert tone="error">{submitError}</Alert>}

      <div className="ui-status-confirmation__actions">
        <Button variant="outline" onClick={onCancel} disabled={isSubmitting}>
          Cancelar
        </Button>
        <Button
          variant={targetActive ? 'primary' : 'danger'}
          onClick={() => void handleConfirm()}
          disabled={isSubmitting}
        >
          {isSubmitting ? 'Guardando...' : targetActive ? 'Sí, activar' : 'Sí, desactivar'}
        </Button>
      </div>
    </div>
  )
}
