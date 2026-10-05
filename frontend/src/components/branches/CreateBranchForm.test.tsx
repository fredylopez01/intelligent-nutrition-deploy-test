import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { branchesService } from '../../services/branches.service'
import { ApiError } from '../../services/http'

import { CreateBranchForm } from './CreateBranchForm'

vi.mock('../../services/branches.service', () => ({
  branchesService: { create: vi.fn() },
}))

vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({ token: 'test-token' }),
}))

const createBranch = vi.mocked(branchesService.create)

function renderForm() {
  const onCreated = vi.fn()
  const onCancel = vi.fn()
  const user = userEvent.setup()
  render(<CreateBranchForm onCreated={onCreated} onCancel={onCancel} />)
  return { user, onCreated, onCancel }
}

async function fillForm(
  user: ReturnType<typeof userEvent.setup>,
  values: { name: string; address: string; phone: string },
) {
  await user.type(screen.getByLabelText('Nombre'), values.name)
  await user.type(screen.getByLabelText('Dirección'), values.address)
  await user.type(screen.getByLabelText('Teléfono'), values.phone)
}

describe('CreateBranchForm', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    createBranch.mockResolvedValue({
      id: 'branch-1',
      name: 'Sede Centro',
      address: 'Carrera 10 # 20-30',
      phone: '6017000000',
      active: true,
    })
  })

  it('sends the trimmed values and notifies the parent when the branch is created', async () => {
    const { user, onCreated } = renderForm()

    await fillForm(user, {
      name: '  Sede Centro ',
      address: ' Carrera 10 # 20-30 ',
      phone: ' 6017000000 ',
    })
    await user.click(screen.getByRole('button', { name: 'Registrar sede' }))

    expect(createBranch).toHaveBeenCalledTimes(1)
    expect(createBranch).toHaveBeenCalledWith(
      { name: 'Sede Centro', address: 'Carrera 10 # 20-30', phone: '6017000000' },
      'test-token',
    )
    expect(onCreated).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('shows a required message for every empty field and does not call the api', async () => {
    const { user, onCreated } = renderForm()

    await user.click(screen.getByRole('button', { name: 'Registrar sede' }))

    expect(await screen.findByText('Ingresa el nombre de la sede')).toBeInTheDocument()
    expect(screen.getByText('Ingresa la dirección')).toBeInTheDocument()
    expect(screen.getByText('Ingresa el teléfono')).toBeInTheDocument()
    expect(screen.getByLabelText('Nombre')).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByLabelText('Dirección')).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByLabelText('Teléfono')).toHaveAttribute('aria-invalid', 'true')
    expect(createBranch).not.toHaveBeenCalled()
    expect(onCreated).not.toHaveBeenCalled()
  })

  it('treats values with only spaces as empty', async () => {
    const { user } = renderForm()

    await fillForm(user, { name: '   ', address: '   ', phone: '   ' })
    await user.click(screen.getByRole('button', { name: 'Registrar sede' }))

    expect(await screen.findByText('Ingresa el nombre de la sede')).toBeInTheDocument()
    expect(screen.getByText('Ingresa la dirección')).toBeInTheDocument()
    expect(screen.getByText('Ingresa el teléfono')).toBeInTheDocument()
    expect(createBranch).not.toHaveBeenCalled()
  })

  it('validates only the missing field when the rest are filled', async () => {
    const { user } = renderForm()

    await user.type(screen.getByLabelText('Nombre'), 'Sede Centro')
    await user.type(screen.getByLabelText('Dirección'), 'Carrera 10 # 20-30')
    await user.click(screen.getByRole('button', { name: 'Registrar sede' }))

    expect(await screen.findByText('Ingresa el teléfono')).toBeInTheDocument()
    expect(screen.queryByText('Ingresa el nombre de la sede')).not.toBeInTheDocument()
    expect(screen.queryByText('Ingresa la dirección')).not.toBeInTheDocument()
    expect(createBranch).not.toHaveBeenCalled()
  })

  it('shows the duplicated name error returned by the api and keeps the form', async () => {
    createBranch.mockRejectedValue(new ApiError('Branch name already exists', 409))
    const { user, onCreated } = renderForm()

    await fillForm(user, {
      name: 'Sede Centro',
      address: 'Carrera 10 # 20-30',
      phone: '6017000000',
    })
    await user.click(screen.getByRole('button', { name: 'Registrar sede' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Ese nombre ya está registrado en otra sede.',
    )
    expect(onCreated).not.toHaveBeenCalled()
    expect(screen.getByLabelText('Nombre')).toHaveValue('Sede Centro')
    expect(screen.getByRole('button', { name: 'Registrar sede' })).toBeEnabled()
  })

  it('disables the actions while the branch is being created', async () => {
    createBranch.mockReturnValue(new Promise(() => {}))
    const { user } = renderForm()

    await fillForm(user, {
      name: 'Sede Centro',
      address: 'Carrera 10 # 20-30',
      phone: '6017000000',
    })
    await user.click(screen.getByRole('button', { name: 'Registrar sede' }))

    expect(await screen.findByRole('button', { name: 'Registrando...' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Cancelar' })).toBeDisabled()
  })
})
