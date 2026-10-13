import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { StatusConfirmation } from './StatusConfirmation'

function renderConfirmation(active: boolean, onConfirm = vi.fn().mockResolvedValue(undefined)) {
  const onCancel = vi.fn()
  const user = userEvent.setup()
  render(
    <StatusConfirmation
      active={active}
      onConfirm={onConfirm}
      onCancel={onCancel}
      resolveError={() => 'No se pudo cambiar el estado.'}
    />,
  )
  return { user, onConfirm, onCancel }
}

describe('StatusConfirmation', () => {
  it('confirms the deactivation of an active record', async () => {
    const { user, onConfirm } = renderConfirmation(true)

    await user.click(screen.getByRole('button', { name: 'Sí, desactivar' }))

    expect(onConfirm).toHaveBeenCalledTimes(1)
  })

  it('confirms the activation of an inactive record', async () => {
    const { user, onConfirm } = renderConfirmation(false)

    await user.click(screen.getByRole('button', { name: 'Sí, activar' }))

    expect(onConfirm).toHaveBeenCalledTimes(1)
  })

  it('disables the buttons while saving', async () => {
    let finish: () => void = () => undefined
    const onConfirm = vi.fn(() => new Promise<void>((resolve) => (finish = resolve)))
    const { user } = renderConfirmation(true, onConfirm)

    await user.click(screen.getByRole('button', { name: 'Sí, desactivar' }))

    expect(screen.getByRole('button', { name: 'Guardando...' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Cancelar' })).toBeDisabled()
    finish()
  })

  it('shows the error and lets the user try again', async () => {
    const onConfirm = vi.fn().mockRejectedValue(new Error('boom'))
    const { user } = renderConfirmation(true, onConfirm)

    await user.click(screen.getByRole('button', { name: 'Sí, desactivar' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo cambiar el estado.')
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Sí, desactivar' })).toBeEnabled(),
    )
  })

  it('cancels without confirming', async () => {
    const { user, onConfirm, onCancel } = renderConfirmation(true)

    await user.click(screen.getByRole('button', { name: 'Cancelar' }))

    expect(onCancel).toHaveBeenCalledTimes(1)
    expect(onConfirm).not.toHaveBeenCalled()
  })
})
