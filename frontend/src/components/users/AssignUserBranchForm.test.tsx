import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { branchesService } from '../../services/branches.service'
import { ApiError } from '../../services/http'
import { usersService } from '../../services/users.service'
import type { Branch } from '../../types/branch'
import type { User, UserBranchAssignment } from '../../types/user'

import { AssignUserBranchForm } from './AssignUserBranchForm'

vi.mock('../../services/users.service', () => ({
  usersService: {
    list: vi.fn(),
    listBranches: vi.fn(),
    assignBranch: vi.fn(),
    deactivateBranch: vi.fn(),
  },
}))

vi.mock('../../services/branches.service', () => ({
  branchesService: { list: vi.fn() },
}))

vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({ token: 'test-token' }),
}))

const listUsers = vi.mocked(usersService.list)
const listUserBranches = vi.mocked(usersService.listBranches)
const assignBranch = vi.mocked(usersService.assignBranch)
const deactivateBranch = vi.mocked(usersService.deactivateBranch)
const listBranches = vi.mocked(branchesService.list)

function buildUser(id: string, firstName: string, lastName: string, email: string): User {
  return {
    id,
    personId: id,
    person: { id, firstName, lastName, email, phone: null, address: null },
    role: { id: 'role-assistant', name: 'BRANCH_ASSISTANT' },
    branches: [],
    active: true,
    mustChangePassword: false,
    lastLoginAt: null,
    createdAt: '2026-10-01T10:00:00.000Z',
    updatedAt: '2026-10-01T10:00:00.000Z',
  }
}

function buildBranch(id: string, name: string, active = true): Branch {
  return { id, name, address: 'Calle 1 # 2-3', phone: '6017000000', active }
}

function assignment(id: string, name: string, active = true): UserBranchAssignment {
  return { id, name, assignmentDate: '2026-10-01', endDate: active ? null : '2026-10-03', active }
}

const juanes = buildUser('user-1', 'Juanes', 'Moreno', 'juanes@intelligent.co')
const yulieth = buildUser('user-2', 'Yulieth', 'Tarazona', 'yulieth@intelligent.co')

const makro = buildBranch('branch-makro', 'Sede Makro')
const viva = buildBranch('branch-viva', 'Sede Viva')
const sogamoso = buildBranch('branch-sogamoso', 'Sede Sogamoso')
const closed = buildBranch('branch-closed', 'Sede Cerrada', false)

function branchesPage(branches: Branch[]) {
  return {
    data: branches,
    meta: { page: 1, limit: 100, total: branches.length, totalPages: 1 },
  }
}

function renderForm(props: { fixedUserId?: string } = {}) {
  const onAssigned = vi.fn()
  const user = userEvent.setup()
  render(<AssignUserBranchForm onAssigned={onAssigned} {...props} />)
  return { user, onAssigned }
}

function branchSelect() {
  return screen.getByRole('combobox', { name: 'Sede' })
}

function optionLabels(select: HTMLElement) {
  return within(select)
    .getAllByRole('option')
    .filter((option) => (option as HTMLOptionElement).value !== '')
    .map((option) => option.textContent)
}

async function pickUser(user: ReturnType<typeof userEvent.setup>, label: string) {
  const userSelect = screen.getByRole('combobox', { name: 'Usuario' })
  await waitFor(() => expect(within(userSelect).getByRole('option', { name: label })).toBeVisible())
  await user.selectOptions(userSelect, label)
}

async function waitForBranchOptions() {
  await waitFor(() => expect(optionLabels(branchSelect()).length).toBeGreaterThan(0))
}

beforeEach(() => {
  vi.resetAllMocks()
  listUsers.mockResolvedValue({
    data: [juanes, yulieth],
    meta: { page: 1, limit: 20, total: 2, totalPages: 1 },
  })
  listBranches.mockResolvedValue(branchesPage([makro, viva, sogamoso]))
  listUserBranches.mockResolvedValue([])
  assignBranch.mockResolvedValue(undefined)
  deactivateBranch.mockResolvedValue(undefined)
})

describe('AssignUserBranchForm branch options', () => {
  it('asks the api only for active branches', async () => {
    renderForm()

    await waitFor(() =>
      expect(listBranches).toHaveBeenCalledWith(
        expect.objectContaining({ active: true, limit: 100 }),
        'test-token',
      ),
    )
    expect(screen.getByText('Solo se muestran sedes activas.')).toBeInTheDocument()
  })

  it('does not offer an inactive branch even if the api returns it', async () => {
    listBranches.mockResolvedValue(branchesPage([makro, closed, viva]))
    const { user } = renderForm()

    await pickUser(user, 'Juanes Moreno — juanes@intelligent.co')
    await waitForBranchOptions()

    expect(optionLabels(branchSelect())).toEqual(['Sede Makro', 'Sede Viva'])
    expect(within(branchSelect()).queryByRole('option', { name: 'Sede Cerrada' })).toBeNull()
  })

  it('hides the branches the user already has active but offers the deactivated ones again', async () => {
    listUserBranches.mockResolvedValue([
      assignment('branch-makro', 'Sede Makro'),
      assignment('branch-viva', 'Sede Viva', false),
    ])
    const { user } = renderForm()

    await pickUser(user, 'Juanes Moreno — juanes@intelligent.co')
    await waitFor(() =>
      expect(optionLabels(branchSelect())).toEqual(['Sede Viva', 'Sede Sogamoso']),
    )
    expect(listUserBranches).toHaveBeenCalledWith('user-1', 'test-token')
  })

  it('explains when no active branch is left for the user', async () => {
    listUserBranches.mockResolvedValue([
      assignment('branch-makro', 'Sede Makro'),
      assignment('branch-viva', 'Sede Viva'),
      assignment('branch-sogamoso', 'Sede Sogamoso'),
    ])
    const { user } = renderForm()

    await pickUser(user, 'Juanes Moreno — juanes@intelligent.co')

    expect(
      await screen.findByText('No quedan sedes activas disponibles para este usuario.'),
    ).toBeInTheDocument()
  })

  it('keeps the branch selector disabled until a user is chosen', async () => {
    const { user } = renderForm()

    expect(branchSelect()).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Asociar a sede' })).toBeDisabled()

    await pickUser(user, 'Juanes Moreno — juanes@intelligent.co')

    await waitFor(() => expect(branchSelect()).toBeEnabled())
    expect(screen.getByRole('button', { name: 'Asociar a sede' })).toBeDisabled()
  })
})

describe('AssignUserBranchForm user search', () => {
  it('searches active users by name or email', async () => {
    const { user } = renderForm()

    await user.type(screen.getByRole('searchbox', { name: 'Buscar usuario' }), '  yulieth ')

    await waitFor(() =>
      expect(listUsers).toHaveBeenLastCalledWith(
        { page: 1, limit: 20, active: true, search: 'yulieth' },
        'test-token',
      ),
    )
  })

  it('tells when no active user matches the search', async () => {
    listUsers.mockResolvedValue({
      data: [],
      meta: { page: 1, limit: 20, total: 0, totalPages: 0 },
    })
    renderForm()

    expect(
      await screen.findByText('Ningún usuario activo coincide con la búsqueda.'),
    ).toBeInTheDocument()
  })
})

describe('AssignUserBranchForm saving', () => {
  async function chooseUserAndBranch(user: ReturnType<typeof userEvent.setup>) {
    await pickUser(user, 'Juanes Moreno — juanes@intelligent.co')
    await waitForBranchOptions()
    await user.selectOptions(branchSelect(), 'Sede Viva')
  }

  it('confirms the association, clears the branch and refreshes the assignments', async () => {
    const { user, onAssigned } = renderForm()
    await chooseUserAndBranch(user)
    const assignmentRequests = listUserBranches.mock.calls.length

    await user.click(screen.getByRole('button', { name: 'Asociar a sede' }))

    expect(assignBranch).toHaveBeenCalledWith('user-1', { branchId: 'branch-viva' }, 'test-token')
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Usuario asociado a la sede correctamente',
    )
    expect(branchSelect()).toHaveValue('')
    expect(onAssigned).toHaveBeenCalledTimes(1)
    await waitFor(() =>
      expect(listUserBranches.mock.calls.length).toBeGreaterThan(assignmentRequests),
    )
  })

  it('shows the saving state while the association is being created', async () => {
    assignBranch.mockReturnValue(new Promise(() => {}))
    const { user } = renderForm()
    await chooseUserAndBranch(user)

    await user.click(screen.getByRole('button', { name: 'Asociar a sede' }))

    expect(await screen.findByRole('button', { name: 'Asociando...' })).toBeDisabled()
  })

  it.each([
    [new ApiError('Cannot assign an inactive branch', 400), 'La sede debe existir y estar activa.'],
    [
      new ApiError('User is already assigned to this branch', 409),
      'El usuario ya tiene una asignación activa a esa sede.',
    ],
    [
      new ApiError('Branch not found', 404),
      'El usuario o la sede ya no existe. Recarga e intenta de nuevo.',
    ],
    [new ApiError('Forbidden', 403), 'No tienes permiso para asociar usuarios a sedes.'],
    [new Error('Network down'), 'No fue posible completar la operación. Intenta de nuevo.'],
  ])('shows the error after saving when the api fails (%s)', async (error, message) => {
    assignBranch.mockRejectedValue(error)
    const { user, onAssigned } = renderForm()
    await chooseUserAndBranch(user)

    await user.click(screen.getByRole('button', { name: 'Asociar a sede' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(message)
    expect(onAssigned).not.toHaveBeenCalled()
    expect(branchSelect()).toHaveValue('branch-viva')
    expect(screen.getByRole('button', { name: 'Asociar a sede' })).toBeEnabled()
  })
})

describe('AssignUserBranchForm inside the user detail', () => {
  it('works on the given user without the user search', async () => {
    renderForm({ fixedUserId: 'user-2' })

    await waitFor(() => expect(listUserBranches).toHaveBeenCalledWith('user-2', 'test-token'))
    expect(screen.queryByRole('searchbox', { name: 'Buscar usuario' })).not.toBeInTheDocument()
    expect(screen.queryByRole('combobox', { name: 'Usuario' })).not.toBeInTheDocument()
    expect(
      await screen.findByText('Este usuario no tiene sedes activas asociadas.'),
    ).toBeInTheDocument()
  })

  it('lists the active assignments and confirms when one is deactivated', async () => {
    listUserBranches.mockResolvedValue([
      assignment('branch-makro', 'Sede Makro'),
      assignment('branch-viva', 'Sede Viva', false),
    ])
    const { user, onAssigned } = renderForm({ fixedUserId: 'user-2' })

    await screen.findByText('Sede Makro', { selector: '.assign-branch__assignment-name' })
    expect(screen.getAllByRole('button', { name: 'Desactivar' })).toHaveLength(1)

    await user.click(screen.getByRole('button', { name: 'Desactivar' }))

    expect(deactivateBranch).toHaveBeenCalledWith('user-2', 'branch-makro', 'test-token')
    expect(await screen.findByRole('status')).toHaveTextContent('La asignación quedó desactivada.')
    expect(onAssigned).toHaveBeenCalledTimes(1)
  })
})
