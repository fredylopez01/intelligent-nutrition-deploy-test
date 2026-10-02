import { useEffect, useMemo, useState } from 'react'

import { useAuth } from '../../hooks/useAuth'
import { useBranches } from '../../hooks/useBranches'
import { useUserBranches } from '../../hooks/useUserBranches'
import { useUsers } from '../../hooks/useUsers'
import { ApiError } from '../../services/http'
import { usersService } from '../../services/users.service'
import { getUserEmail, getUserFullName } from '../../utils/users'
import { Alert } from '../ui/Alert'
import { Button } from '../ui/Button'
import { SelectField } from '../ui/SelectField'

import './AssignUserBranchForm.css'

interface AssignUserBranchFormProps {
  initialUserId?: string | null
  onAssigned: () => void
  onClose: () => void
}

function resolveErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 409) return 'El usuario ya tiene una asignación activa a esa sede.'
    if (error.status === 404)
      return 'El usuario o la sede ya no existe. Recarga e intenta de nuevo.'
    if (error.status === 403) return 'No tienes permiso para asociar usuarios a sedes.'
    if (error.status === 400) return 'La sede debe existir y estar activa.'
    return error.message
  }
  return 'No fue posible completar la operación. Intenta de nuevo.'
}

export function AssignUserBranchForm({
  initialUserId = null,
  onAssigned,
  onClose,
}: AssignUserBranchFormProps) {
  const { token } = useAuth()
  const [userSearch, setUserSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [selectedUserId, setSelectedUserId] = useState<string>(initialUserId ?? '')
  const [selectedBranchId, setSelectedBranchId] = useState('')
  const [feedback, setFeedback] = useState<{ tone: 'success' | 'error'; text: string } | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [deactivatingId, setDeactivatingId] = useState<string | null>(null)

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(userSearch.trim()), 300)
    return () => clearTimeout(timer)
  }, [userSearch])

  const { users, status: usersStatus } = useUsers({
    page: 1,
    limit: 20,
    active: true,
    search: debouncedSearch || undefined,
  })

  const { branches, status: branchesStatus } = useBranches({ limit: 100, active: true })

  const {
    assignments,
    status: assignmentsStatus,
    refetch: refetchAssignments,
  } = useUserBranches(selectedUserId || null)

  const userOptions = useMemo(
    () =>
      users.map((user) => ({
        value: user.id,
        label: `${getUserFullName(user)} — ${getUserEmail(user)}`,
      })),
    [users],
  )

  const activeAssignments = assignments.filter((assignment) => assignment.active)
  const assignedBranchIds = new Set(activeAssignments.map((assignment) => assignment.id))

  const branchOptions = branches
    .filter((branch) => branch.active && !assignedBranchIds.has(branch.id))
    .map((branch) => ({ value: branch.id, label: branch.name }))

  const handleAssign = async () => {
    if (!selectedUserId || !selectedBranchId) return
    setFeedback(null)
    setIsSubmitting(true)
    try {
      await usersService.assignBranch(selectedUserId, { branchId: selectedBranchId }, token)
      setFeedback({ tone: 'success', text: 'Usuario asociado a la sede correctamente' })
      setSelectedBranchId('')
      refetchAssignments()
      onAssigned()
    } catch (error) {
      setFeedback({ tone: 'error', text: resolveErrorMessage(error) })
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleDeactivate = async (branchId: string) => {
    setFeedback(null)
    setDeactivatingId(branchId)
    try {
      await usersService.deactivateBranch(selectedUserId, branchId, token)
      setFeedback({ tone: 'success', text: 'La asignación quedó desactivada.' })
      refetchAssignments()
      onAssigned()
    } catch (error) {
      setFeedback({ tone: 'error', text: resolveErrorMessage(error) })
    } finally {
      setDeactivatingId(null)
    }
  }

  return (
    <div className="assign-branch">
      {feedback && <Alert tone={feedback.tone}>{feedback.text}</Alert>}

      <div className="assign-branch__field">
        <label className="assign-branch__label" htmlFor="assign-user-search">
          Buscar usuario
        </label>
        <input
          id="assign-user-search"
          type="search"
          className="assign-branch__search"
          placeholder="Nombre o correo"
          value={userSearch}
          onChange={(event) => setUserSearch(event.target.value)}
        />
      </div>

      <SelectField
        id="assign-user-id"
        label="Usuario"
        placeholder={usersStatus === 'loading' ? 'Buscando...' : 'Selecciona un usuario'}
        options={userOptions}
        value={selectedUserId}
        onChange={(event) => {
          setSelectedUserId(event.target.value)
          setSelectedBranchId('')
          setFeedback(null)
        }}
        hint={
          usersStatus === 'success' && userOptions.length === 0
            ? 'Ningún usuario activo coincide con la búsqueda.'
            : undefined
        }
      />

      {selectedUserId && (
        <div className="assign-branch__assignments">
          <p className="assign-branch__assignments-title">Sedes ya asociadas</p>
          {assignmentsStatus === 'loading' && (
            <p className="assign-branch__hint">Cargando asignaciones...</p>
          )}
          {assignmentsStatus === 'error' && (
            <p className="assign-branch__hint">No fue posible cargar las sedes del usuario.</p>
          )}
          {assignmentsStatus === 'success' && activeAssignments.length === 0 && (
            <p className="assign-branch__hint">Este usuario no tiene sedes activas asociadas.</p>
          )}
          {activeAssignments.map((assignment) => (
            <div className="assign-branch__assignment" key={assignment.id}>
              <span className="assign-branch__assignment-name">{assignment.name}</span>
              <button
                type="button"
                className="assign-branch__deactivate"
                onClick={() => void handleDeactivate(assignment.id)}
                disabled={deactivatingId === assignment.id}
              >
                {deactivatingId === assignment.id ? 'Desactivando...' : 'Desactivar'}
              </button>
            </div>
          ))}
        </div>
      )}

      <SelectField
        id="assign-branch-id"
        label="Sede"
        placeholder={branchesStatus === 'loading' ? 'Cargando sedes...' : 'Selecciona una sede'}
        options={branchOptions}
        value={selectedBranchId}
        disabled={!selectedUserId || branchesStatus === 'loading'}
        onChange={(event) => setSelectedBranchId(event.target.value)}
        hint={
          selectedUserId && branchesStatus === 'success' && branchOptions.length === 0
            ? 'No quedan sedes activas disponibles para este usuario.'
            : 'Solo se muestran sedes activas.'
        }
      />

      <div className="assign-branch__actions">
        <Button variant="outline" onClick={onClose} disabled={isSubmitting}>
          Cerrar
        </Button>
        <Button
          onClick={() => void handleAssign()}
          disabled={!selectedUserId || !selectedBranchId || isSubmitting}
        >
          {isSubmitting ? 'Asociando...' : 'Asociar a sede'}
        </Button>
      </div>
    </div>
  )
}
