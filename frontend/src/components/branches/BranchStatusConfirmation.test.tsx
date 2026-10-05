import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { branchesService } from '../../services/branches.service'
import { ApiError } from '../../services/http'
import type { Branch } from '../../types/branch'

import { BranchStatusConfirmation } from './BranchStatusConfirmation'

vi.mock('../../services/branches.service', () => ({
  branchesService: { updateStatus: vi.fn() },
}))

vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({ token: 'test-token' }),
}))

const updateStatus = vi.mocked(branchesService.updateStatus)

const activeBranch: Branch = {
  id: 'branch-1',
  name: 'Sede Makro',
  address: 'Av. Universitaria 20-30, Tunja',
  phone: '3007000001',
  active: true,
}

const inactiveBranch: Branch = { ...activeBranch, id: 'branch-2', name: 'Sede Viva', active: false }

function renderConfirmation(branch: Branch) {
  const onChanged = vi.fn()
  const onCancel = vi.fn()
  const user = userEvent.setup()
  render(<BranchStatusConfirmation branch={branch} onChanged={onChanged} onCancel={onCancel} />)
  return { user, onChanged, onCancel }
}

describe('BranchStatusConfirmation', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  describe('label according to the current status', () => {
    it('offers to deactivate an active branch', () => {
      renderConfirmation(activeBranch)

      expect(screen.getByRole('button', { name: 'Sí, desactivar' })).toBeEnabled()
      expect(screen.queryByRole('button', { name: 'Sí, activar' })).not.toBeInTheDocument()
    })

    it('offers to activate an inactive branch', () => {
      renderConfirmation(inactiveBranch)

      expect(screen.getByRole('button', { name: 'Sí, activar' })).toBeEnabled()
      expect(screen.queryByRole('button', { name: 'Sí, desactivar' })).not.toBeInTheDocument()
    })
  })

  describe('status change', () => {
    it('deactivates an active branch and returns the updated branch', async () => {
      const updated = { ...activeBranch, active: false }
      updateStatus.mockResolvedValue(updated)
      const { user, onChanged } = renderConfirmation(activeBranch)

      await user.click(screen.getByRole('button', { name: 'Sí, desactivar' }))

      expect(updateStatus).toHaveBeenCalledWith('branch-1', { active: false }, 'test-token')
      expect(onChanged).toHaveBeenCalledWith(updated)
    })

    it('activates an inactive branch and returns the updated branch', async () => {
      const updated = { ...inactiveBranch, active: true }
      updateStatus.mockResolvedValue(updated)
      const { user, onChanged } = renderConfirmation(inactiveBranch)

      await user.click(screen.getByRole('button', { name: 'Sí, activar' }))

      expect(updateStatus).toHaveBeenCalledWith('branch-2', { active: true }, 'test-token')
      expect(onChanged).toHaveBeenCalledWith(updated)
    })

    it('shows the saving state and disables both actions while waiting', async () => {
      updateStatus.mockReturnValue(new Promise(() => {}))
      const { user } = renderConfirmation(activeBranch)

      await user.click(screen.getByRole('button', { name: 'Sí, desactivar' }))

      expect(await screen.findByRole('button', { name: 'Guardando...' })).toBeDisabled()
      expect(screen.getByRole('button', { name: 'Cancelar' })).toBeDisabled()
    })

    it('closes without calling the api when the user cancels', async () => {
      const { user, onCancel } = renderConfirmation(activeBranch)

      await user.click(screen.getByRole('button', { name: 'Cancelar' }))

      expect(onCancel).toHaveBeenCalledTimes(1)
      expect(updateStatus).not.toHaveBeenCalled()
    })
  })

  describe('double transition', () => {
    it('explains that the branch is already inactive', async () => {
      updateStatus.mockRejectedValue(new ApiError('Branch is already inactive', 400))
      const { user, onChanged } = renderConfirmation(activeBranch)

      await user.click(screen.getByRole('button', { name: 'Sí, desactivar' }))

      expect(await screen.findByRole('alert')).toHaveTextContent(
        'La sede ya se encuentra inactiva. Recarga el listado para ver su estado actual.',
      )
      expect(onChanged).not.toHaveBeenCalled()
      expect(screen.getByRole('button', { name: 'Sí, desactivar' })).toBeEnabled()
    })

    it('explains that the branch is already active', async () => {
      updateStatus.mockRejectedValue(new ApiError('Branch is already active', 400))
      const { user } = renderConfirmation(inactiveBranch)

      await user.click(screen.getByRole('button', { name: 'Sí, activar' }))

      expect(await screen.findByRole('alert')).toHaveTextContent(
        'La sede ya se encuentra activa. Recarga el listado para ver su estado actual.',
      )
    })

    it('clears the previous error when the user tries again', async () => {
      updateStatus
        .mockRejectedValueOnce(new ApiError('Branch is already inactive', 400))
        .mockReturnValue(new Promise(() => {}))
      const { user } = renderConfirmation(activeBranch)

      await user.click(screen.getByRole('button', { name: 'Sí, desactivar' }))
      await screen.findByRole('alert')
      await user.click(screen.getByRole('button', { name: 'Sí, desactivar' }))

      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    })
  })

  describe('other errors', () => {
    it.each([
      [new ApiError('Forbidden', 403), 'No tienes permiso para cambiar el estado de las sedes.'],
      [new ApiError('Branch not found', 404), 'Esta sede ya no existe. Recarga el listado.'],
      [new ApiError('Internal error', 500), 'Internal error'],
      [new Error('Network down'), 'No fue posible cambiar el estado de la sede. Intenta de nuevo.'],
    ])('shows a message for %s', async (error, message) => {
      updateStatus.mockRejectedValue(error)
      const { user, onChanged } = renderConfirmation(activeBranch)

      await user.click(screen.getByRole('button', { name: 'Sí, desactivar' }))

      expect(await screen.findByRole('alert')).toHaveTextContent(message)
      expect(onChanged).not.toHaveBeenCalled()
    })
  })
})
