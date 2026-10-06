import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { branchesService } from '../../services/branches.service'
import { ApiError } from '../../services/http'
import type { Branch, BranchesListResponse } from '../../types/branch'

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
const updateStatus = vi.mocked(branchesService.updateStatus)

const makro: Branch = {
  id: 'branch-1',
  name: 'Sede Makro',
  address: 'Av. Universitaria 20-30, Tunja',
  phone: '3007000001',
  active: true,
}

function pageOf(branch: Branch): BranchesListResponse {
  return { data: [branch], meta: { page: 1, limit: 10, total: 1, totalPages: 1 } }
}

function getRow(name: string) {
  const row = screen.getByRole('cell', { name }).closest('tr')
  if (!row) throw new Error(`No row found for ${name}`)
  return within(row)
}

async function openRowMenu(user: ReturnType<typeof userEvent.setup>, name: string) {
  await user.click(await screen.findByRole('button', { name: `Acciones para ${name}` }))
}

describe('BranchesPage status button', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('deactivates an active branch and then offers to activate it', async () => {
    const deactivated = { ...makro, active: false }
    listBranches.mockResolvedValueOnce(pageOf(makro)).mockResolvedValue(pageOf(deactivated))
    updateStatus.mockResolvedValue(deactivated)
    const user = userEvent.setup()
    render(<BranchesPage />)

    await openRowMenu(user, 'Sede Makro')
    await user.click(screen.getByRole('menuitem', { name: 'Desactivar' }))

    const dialog = within(screen.getByRole('dialog', { name: '¿Desactivar esta sede?' }))
    expect(
      dialog.getByText('Sede Makro quedará inactiva y no estará disponible para la operación.'),
    ).toBeInTheDocument()
    await user.click(dialog.getByRole('button', { name: 'Sí, desactivar' }))

    expect(await screen.findByText('La sede Sede Makro ahora está inactiva.')).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    await waitFor(() => expect(getRow('Sede Makro').getByText('Inactivo')).toBeInTheDocument())

    await openRowMenu(user, 'Sede Makro')
    expect(screen.getByRole('menuitem', { name: 'Activar' })).toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: 'Desactivar' })).not.toBeInTheDocument()
  })

  it('activates an inactive branch and then offers to deactivate it', async () => {
    const inactive = { ...makro, active: false }
    listBranches.mockResolvedValueOnce(pageOf(inactive)).mockResolvedValue(pageOf(makro))
    updateStatus.mockResolvedValue(makro)
    const user = userEvent.setup()
    render(<BranchesPage />)

    await openRowMenu(user, 'Sede Makro')
    await user.click(screen.getByRole('menuitem', { name: 'Activar' }))

    const dialog = within(screen.getByRole('dialog', { name: '¿Activar esta sede?' }))
    expect(
      dialog.getByText('Sede Makro volverá a estar disponible para la operación.'),
    ).toBeInTheDocument()
    await user.click(dialog.getByRole('button', { name: 'Sí, activar' }))

    expect(await screen.findByText('La sede Sede Makro ahora está activa.')).toBeInTheDocument()
    await waitFor(() => expect(getRow('Sede Makro').getByText('Activo')).toBeInTheDocument())

    await openRowMenu(user, 'Sede Makro')
    expect(screen.getByRole('menuitem', { name: 'Desactivar' })).toBeInTheDocument()
  })

  it('keeps the dialog open with the double transition error', async () => {
    listBranches.mockResolvedValue(pageOf(makro))
    updateStatus.mockRejectedValue(new ApiError('Branch is already inactive', 400))
    const user = userEvent.setup()
    render(<BranchesPage />)

    await openRowMenu(user, 'Sede Makro')
    await user.click(screen.getByRole('menuitem', { name: 'Desactivar' }))
    const dialog = within(screen.getByRole('dialog', { name: '¿Desactivar esta sede?' }))
    await user.click(dialog.getByRole('button', { name: 'Sí, desactivar' }))

    expect(await dialog.findByRole('alert')).toHaveTextContent(
      'La sede ya se encuentra inactiva. Recarga el listado para ver su estado actual.',
    )
    expect(screen.getByRole('dialog', { name: '¿Desactivar esta sede?' })).toBeInTheDocument()
    expect(screen.queryByText(/ahora está/)).not.toBeInTheDocument()
  })
})
