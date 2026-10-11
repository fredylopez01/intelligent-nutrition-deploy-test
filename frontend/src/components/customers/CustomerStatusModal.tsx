import { useState } from 'react'

import { useAuth } from '../../hooks/useAuth'
import { customersService } from '../../services/customers.service'
import type { Customer } from '../../types/customer'
import { resolveCustomerError } from '../../utils/customers'
import { Alert } from '../ui/Alert'
import { Button } from '../ui/Button'
import { Modal } from '../ui/Modal'

import './CustomerForm.css'

interface CustomerStatusModalProps {
  customer: Customer | null
  onClose: () => void
  onChanged: (customer: Customer, active: boolean) => void
}

export function CustomerStatusModal({ customer, onClose, onChanged }: CustomerStatusModalProps) {
  const { token } = useAuth()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  const targetActive = customer ? !customer.active : false

  const close = () => {
    if (isSubmitting) return
    setSubmitError(null)
    onClose()
  }

  const handleConfirm = async () => {
    if (!customer) return
    setSubmitError(null)
    setIsSubmitting(true)
    try {
      await customersService.updateStatus(customer.id, { active: targetActive }, token)
      onChanged(customer, targetActive)
    } catch (error) {
      setSubmitError(
        resolveCustomerError(
          error,
          'No fue posible cambiar el estado del cliente. Intenta de nuevo.',
        ),
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Modal
      open={customer !== null}
      title={targetActive ? '¿Activar este cliente?' : '¿Desactivar este cliente?'}
      description={
        customer
          ? targetActive
            ? `${customer.fullName} volverá a estar disponible para registrarle ventas.`
            : `${customer.fullName} no podrá usarse en ventas nuevas. Su historial y sus datos se conservan.`
          : undefined
      }
      onClose={close}
    >
      <div className="customer-form">
        {submitError && <Alert tone="error">{submitError}</Alert>}
        <div className="customer-form__actions">
          <Button variant="outline" onClick={close} disabled={isSubmitting}>
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
    </Modal>
  )
}
