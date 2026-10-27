import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ApiError } from '../../services/http'
import { inventoryClosuresService } from '../../services/inventoryClosures.service'
import { buildClosure } from '../../test-utils/inventoryClosures'

import { ClosureStart } from './ClosureStart'

vi.mock('../../services/inventoryClosures.service', () => ({
  inventoryClosuresService: { start: vi.fn(), get: vi.fn() },
}))

vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({ token: 'test-token' }),
}))

const start = vi.mocked(inventoryClosuresService.start)
const get = vi.mocked(inventoryClosuresService.get)

function renderStart() {
  const onStarted = vi.fn()
  const user = userEvent.setup()
  render(
    <ClosureStart
      branchId="branch-centro"
      branchName="Centro"
      today="2026-10-26"
      onStarted={onStarted}
    />,
  )
  return { user, onStarted }
}

beforeEach(() => {
  vi.resetAllMocks()
})

describe('ClosureStart', () => {
  it('explains the blind count and starts the closure of the day', async () => {
    const closure = buildClosure()
    start.mockResolvedValue(closure)
    const { user, onStarted } = renderStart()

    expect(screen.getByText('lunes, 26 de octubre')).toBeInTheDocument()
    expect(screen.getByText(/El conteo es ciego/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Iniciar cierre del día' }))

    await waitFor(() => expect(onStarted).toHaveBeenCalledWith(closure))
    expect(start).toHaveBeenCalledWith('branch-centro', 'test-token')
  })

  it('opens the existing closure when another user already started it', async () => {
    const existing = buildClosure({ id: 'closure-existing' })
    start.mockRejectedValue(
      new ApiError('Exists', 409, { closureId: 'closure-existing' }, 'CLOSURE_ALREADY_EXISTS'),
    )
    get.mockResolvedValue(existing)
    const { user, onStarted } = renderStart()

    await user.click(screen.getByRole('button', { name: 'Iniciar cierre del día' }))

    await waitFor(() => expect(onStarted).toHaveBeenCalledWith(existing))
    expect(get).toHaveBeenCalledWith('closure-existing', 'test-token')
  })

  it('explains why an inactive branch cannot start the closure', async () => {
    start.mockRejectedValue(new ApiError('Inactive', 422, {}, 'BRANCH_INACTIVE'))
    const { user, onStarted } = renderStart()

    await user.click(screen.getByRole('button', { name: 'Iniciar cierre del día' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'La sede está inactiva: no se puede iniciar el cierre.',
    )
    expect(onStarted).not.toHaveBeenCalled()
  })
})
