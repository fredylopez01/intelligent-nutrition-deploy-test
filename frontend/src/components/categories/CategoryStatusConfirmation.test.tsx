import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { categoriesService } from '../../services/categories.service'
import { ApiError } from '../../services/http'
import type { Category } from '../../types/category'

import { CategoryStatusConfirmation } from './CategoryStatusConfirmation'

vi.mock('../../services/categories.service', () => ({
  categoriesService: { updateStatus: vi.fn() },
}))

vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({ token: 'test-token' }),
}))

const updateStatus = vi.mocked(categoriesService.updateStatus)

const proteins: Category = {
  id: 'cat-1',
  name: 'Proteínas',
  description: 'Suplementos de proteína',
  active: true,
}

function renderConfirmation(category: Category = proteins) {
  const onChanged = vi.fn()
  const onCancel = vi.fn()
  const user = userEvent.setup()
  render(
    <CategoryStatusConfirmation category={category} onChanged={onChanged} onCancel={onCancel} />,
  )
  return { user, onChanged, onCancel }
}

beforeEach(() => {
  vi.resetAllMocks()
  updateStatus.mockResolvedValue({ message: 'Category status updated successfully.' })
})

describe('CategoryStatusConfirmation', () => {
  it('deactivates an active category', async () => {
    const { user, onChanged } = renderConfirmation()

    await user.click(screen.getByRole('button', { name: 'Sí, desactivar' }))

    expect(updateStatus).toHaveBeenCalledWith('cat-1', { active: false }, 'test-token')
    await waitFor(() => expect(onChanged).toHaveBeenCalledWith({ ...proteins, active: false }))
  })

  it('activates an inactive category', async () => {
    const { user, onChanged } = renderConfirmation({ ...proteins, active: false })

    await user.click(screen.getByRole('button', { name: 'Sí, activar' }))

    expect(updateStatus).toHaveBeenCalledWith('cat-1', { active: true }, 'test-token')
    await waitFor(() => expect(onChanged).toHaveBeenCalledWith({ ...proteins, active: true }))
  })

  it('keeps the confirmation open with the error', async () => {
    updateStatus.mockRejectedValue(
      new ApiError('Category is already in the requested state.', 409, {}, 'ALREADY_IN_STATE'),
    )
    const { user, onChanged } = renderConfirmation()

    await user.click(screen.getByRole('button', { name: 'Sí, desactivar' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'La categoría ya tenía ese estado. Recarga el listado para ver su estado actual.',
    )
    expect(screen.getByRole('button', { name: 'Sí, desactivar' })).toBeEnabled()
    expect(onChanged).not.toHaveBeenCalled()
  })

  it('disables both buttons and shows "Guardando..." while submitting', async () => {
    updateStatus.mockReturnValue(new Promise(() => {}))
    const { user } = renderConfirmation()

    await user.click(screen.getByRole('button', { name: 'Sí, desactivar' }))

    expect(await screen.findByRole('button', { name: 'Guardando...' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Cancelar' })).toBeDisabled()
  })

  it('cancels without changing the state', async () => {
    const { user, onCancel } = renderConfirmation()

    await user.click(screen.getByRole('button', { name: 'Cancelar' }))

    expect(onCancel).toHaveBeenCalledTimes(1)
    expect(updateStatus).not.toHaveBeenCalled()
  })
})
