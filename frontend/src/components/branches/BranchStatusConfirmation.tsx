import { useState } from 'react'

import { useAuth } from '../../hooks/useAuth'
import { branchesService } from '../../services/branches.service'
import { ApiError } from '../../services/http'
import type { Branch } from '../../types/branch'
import { Alert } from '../ui/Alert'
import { Button } from '../ui/Button'

import './BranchForm.css'

interface BranchStatusConfirmationProps {
  branch: Branch
  onChanged: (updatedBranch: Branch) => void
  onCancel: () => void
}

function resolveErrorMessage(error: unknown, targetActive: boolean): string {
  if (error instanceof ApiError) {
    // 400 is the backend's invalid transition: the branch already has the requested status.
    if (error.status === 400) {
      return `La sede ya se encuentra ${targetActive ? 'activa' : 'inactiva'}. Recarga el listado para ver su estado actual.`
    }
    if (error.status === 403) return 'No tienes permiso para cambiar el estado de las sedes.'
    if (error.status === 404) return 'Esta sede ya no existe. Recarga el listado.'
    return error.message
  }

  return 'No fue posible cambiar el estado de la sede. Intenta de nuevo.'
}

export function BranchStatusConfirmation({
  branch,
  onChanged,
  onCancel,
}: BranchStatusConfirmationProps) {
  const { token } = useAuth()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const targetActive = !branch.active

  const handleConfirm = async () => {
    setSubmitError(null)
    setIsSubmitting(true)
    try {
      const updatedBranch = await branchesService.updateStatus(
        branch.id,
        { active: targetActive },
        token,
      )
      onChanged(updatedBranch)
    } catch (error) {
      setSubmitError(resolveErrorMessage(error, targetActive))
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="branch-form">
      {submitError && <Alert tone="error">{submitError}</Alert>}

      <div className="branch-form__actions">
        <Button variant="outline" onClick={onCancel} disabled={isSubmitting}>
          Cancelar
        </Button>
        <Button
          variant={targetActive ? 'primary' : 'danger'}
          onClick={handleConfirm}
          disabled={isSubmitting}
        >
          {isSubmitting ? 'Guardando...' : targetActive ? 'Sí, activar' : 'Sí, desactivar'}
        </Button>
      </div>
    </div>
  )
}
