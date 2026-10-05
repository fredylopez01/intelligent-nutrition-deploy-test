import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { branchesService } from '../../services/branches.service'
import { ApiError } from '../../services/http'
import type { Branch } from '../../types/branch'

import { EditBranchForm } from './EditBranchForm'

vi.mock('../../services/branches.service', () => ({
  branchesService: { update: vi.fn() },
}))

vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({ token: 'test-token' }),
}))

const updateBranch = vi.mocked(branchesService.update)

const branch: Branch = {
  id: 'branch-1',
  name: 'Sede Makro',
  address: 'Av. Universitaria 20-30, Tunja',
  phone: '3007000001',
  active: true,
}

function renderForm() {
  const onUpdated = vi.fn()
  const onCancel = vi.fn()
  const user = userEvent.setup()
  render(<EditBranchForm branch={branch} onUpdated={onUpdated} onCancel={onCancel} />)
  return { user, onUpdated, onCancel }
}

async function replaceValue(
  user: ReturnType<typeof userEvent.setup>,
  label: string,
  value: string,
) {
  const field = screen.getByLabelText(label)
  await user.clear(field)
  if (value) await user.type(field, value)
}

describe('EditBranchForm', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    updateBranch.mockResolvedValue({ ...branch, phone: '3007999999' })
  })

  it('opens with the current data in editable fields', () => {
    renderForm()

    expect(screen.getByLabelText('Nombre')).toHaveValue('Sede Makro')
    expect(screen.getByLabelText('Dirección')).toHaveValue('Av. Universitaria 20-30, Tunja')
    expect(screen.getByLabelText('Teléfono')).toHaveValue('3007000001')
    for (const label of ['Nombre', 'Dirección', 'Teléfono']) {
      expect(screen.getByLabelText(label)).toBeEnabled()
    }
    expect(screen.getByText('Solo números, sin espacios ni símbolos.')).toBeInTheDocument()
  })

  it('sends only the fields that changed, trimmed, and confirms the update', async () => {
    const { user, onUpdated } = renderForm()

    await replaceValue(user, 'Teléfono', ' 3007999999 ')
    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }))

    expect(updateBranch).toHaveBeenCalledWith('branch-1', { phone: '3007999999' }, 'test-token')
    expect(onUpdated).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('sends every field when all of them changed', async () => {
    const { user } = renderForm()

    await replaceValue(user, 'Nombre', 'Sede Makro Norte')
    await replaceValue(user, 'Dirección', 'Calle 50 # 10-20')
    await replaceValue(user, 'Teléfono', '3007888888')
    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }))

    expect(updateBranch).toHaveBeenCalledWith(
      'branch-1',
      { name: 'Sede Makro Norte', address: 'Calle 50 # 10-20', phone: '3007888888' },
      'test-token',
    )
  })

  it('warns when there is nothing to save', async () => {
    const { user, onUpdated } = renderForm()

    await replaceValue(user, 'Nombre', '  Sede Makro  ')
    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('No hay cambios por guardar.')
    expect(updateBranch).not.toHaveBeenCalled()
    expect(onUpdated).not.toHaveBeenCalled()
  })

  it.each([
    ['letters', '30070abc'],
    ['symbols', '300-700-0001'],
    ['spaces in the middle', '300 700 0001'],
  ])('rejects a phone with %s before calling the api', async (_case, phone) => {
    const { user } = renderForm()

    await replaceValue(user, 'Teléfono', phone)
    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }))

    expect(
      await screen.findByText('El teléfono solo puede contener números, sin espacios ni símbolos'),
    ).toBeInTheDocument()
    expect(screen.getByLabelText('Teléfono')).toHaveAttribute('aria-invalid', 'true')
    expect(updateBranch).not.toHaveBeenCalled()
  })

  it('asks for every field that was left empty', async () => {
    const { user } = renderForm()

    await replaceValue(user, 'Nombre', '')
    await replaceValue(user, 'Dirección', '')
    await replaceValue(user, 'Teléfono', '')
    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }))

    expect(await screen.findByText('Ingresa el nombre de la sede')).toBeInTheDocument()
    expect(screen.getByText('Ingresa la dirección')).toBeInTheDocument()
    expect(screen.getByText('Ingresa el teléfono')).toBeInTheDocument()
    expect(updateBranch).not.toHaveBeenCalled()
  })

  it.each([
    [
      new ApiError('Branch name already exists', 409),
      'Ese nombre ya está registrado en otra sede.',
    ],
    [new ApiError('Branch not found', 404), 'Esta sede ya no existe. Recarga el listado.'],
    [new ApiError('Forbidden', 403), 'No tienes permiso para editar sedes.'],
    [new ApiError('Request validation failed.', 400), 'Request validation failed.'],
    [new Error('Network down'), 'No fue posible guardar los cambios. Intenta de nuevo.'],
  ])('shows the error after saving when the api fails (%s)', async (error, message) => {
    updateBranch.mockRejectedValue(error)
    const { user, onUpdated } = renderForm()

    await replaceValue(user, 'Teléfono', '3007999999')
    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(message)
    expect(onUpdated).not.toHaveBeenCalled()
    expect(screen.getByLabelText('Teléfono')).toHaveValue('3007999999')
    expect(screen.getByRole('button', { name: 'Guardar cambios' })).toBeEnabled()
  })

  it('disables the actions while the changes are being saved', async () => {
    updateBranch.mockReturnValue(new Promise(() => {}))
    const { user } = renderForm()

    await replaceValue(user, 'Teléfono', '3007999999')
    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }))

    expect(await screen.findByRole('button', { name: 'Guardando...' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Cancelar' })).toBeDisabled()
  })

  it('closes without saving when the user cancels', async () => {
    const { user, onCancel } = renderForm()

    await replaceValue(user, 'Teléfono', '3007999999')
    await user.click(screen.getByRole('button', { name: 'Cancelar' }))

    expect(onCancel).toHaveBeenCalledTimes(1)
    expect(updateBranch).not.toHaveBeenCalled()
  })
})
