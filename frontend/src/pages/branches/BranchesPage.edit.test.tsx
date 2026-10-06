import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { branchesService } from '../../services/branches.service'
import { ApiError } from '../../services/http'
import type { Branch } from '../../types/branch'

import { BranchesPage } from './BranchesPage'

vi.mock('../../services/branches.service', () => ({
  branchesService: {
    list: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    updateStatus: vi.fn(),
  },
}))

vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({ token: 'test-token' }),
}))

vi.mock('../../layouts/AppLayout', () => ({
  AppLayout: ({ title, children }: { title: string; children: ReactNode }) => (
    <main>
      <h1>{title}</h1>
      {children}
    </main>
  ),
}))

const listBranches = vi.mocked(branchesService.list)
const updateBranch = vi.mocked(branchesService.update)

const makro: Branch = {
  id: 'branch-1',
  name: 'Sede Makro',
  address: 'Av. Universitaria 20-30, Tunja',
  phone: '3007000001',
  active: true,
}

async function openEditDialog() {
  const user = userEvent.setup()
  render(<BranchesPage />)

  await user.click(await screen.findByRole('button', { name: 'Acciones para Sede Makro' }))
  await user.click(screen.getByRole('menuitem', { name: 'Editar' }))

  const dialog = screen.getByRole('dialog', { name: 'Editar sede' })
  return { user, dialog: within(dialog) }
}

describe('BranchesPage edit flow', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    listBranches.mockResolvedValue({
      data: [makro],
      meta: { page: 1, limit: 10, total: 1, totalPages: 1 },
    })
  })

  it('opens the edit dialog with the selected branch ready to edit', async () => {
    const { dialog } = await openEditDialog()

    expect(dialog.getByLabelText('Nombre')).toHaveValue('Sede Makro')
    expect(dialog.getByLabelText('Nombre')).toBeEnabled()
    expect(dialog.getByLabelText('Dirección')).toHaveValue('Av. Universitaria 20-30, Tunja')
    expect(dialog.getByLabelText('Teléfono')).toHaveValue('3007000001')
  })

  it('closes the dialog, confirms the change and reloads the list after saving', async () => {
    updateBranch.mockResolvedValue({ ...makro, phone: '3007999999' })
    const { user, dialog } = await openEditDialog()
    const requestsBeforeSaving = listBranches.mock.calls.length

    await user.clear(dialog.getByLabelText('Teléfono'))
    await user.type(dialog.getByLabelText('Teléfono'), '3007999999')
    await user.click(dialog.getByRole('button', { name: 'Guardar cambios' }))

    expect(await screen.findByText('Los cambios se guardaron correctamente.')).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    await waitFor(() =>
      expect(listBranches.mock.calls.length).toBeGreaterThan(requestsBeforeSaving),
    )
  })

  it('keeps the dialog open with the error when saving fails', async () => {
    updateBranch.mockRejectedValue(new ApiError('Branch name already exists', 409))
    const { user, dialog } = await openEditDialog()

    await user.clear(dialog.getByLabelText('Nombre'))
    await user.type(dialog.getByLabelText('Nombre'), 'Sede Sogamoso')
    await user.click(dialog.getByRole('button', { name: 'Guardar cambios' }))

    expect(await dialog.findByRole('alert')).toHaveTextContent(
      'Ese nombre ya está registrado en otra sede.',
    )
    expect(screen.getByRole('dialog', { name: 'Editar sede' })).toBeInTheDocument()
    expect(screen.queryByText('Los cambios se guardaron correctamente.')).not.toBeInTheDocument()
  })

  it('closes the dialog without saving when the user cancels', async () => {
    const { user, dialog } = await openEditDialog()

    await user.click(dialog.getByRole('button', { name: 'Cancelar' }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(updateBranch).not.toHaveBeenCalled()
  })
})
