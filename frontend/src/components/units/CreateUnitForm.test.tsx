import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ApiError } from '../../services/http'
import { unitsService } from '../../services/units.service'
import type { UnitOfMeasure } from '../../types/unit'

import { CreateUnitForm } from './CreateUnitForm'

vi.mock('../../services/units.service', () => ({
  unitsService: { list: vi.fn(), create: vi.fn() },
}))

vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({ token: 'test-token' }),
}))

const listUnits = vi.mocked(unitsService.list)
const createUnit = vi.mocked(unitsService.create)

const kilogram: UnitOfMeasure = {
  id: 'unit-1',
  name: 'Kilogramo',
  abbreviation: 'kg',
  active: true,
}
const gram: UnitOfMeasure = { id: 'unit-2', name: 'Gramo', abbreviation: 'g', active: true }

function pageOf(data: UnitOfMeasure[], page = 1, totalPages = 1) {
  return { data, meta: { page, limit: 100, total: data.length, totalPages } }
}

function renderForm() {
  const onCreated = vi.fn()
  const onCancel = vi.fn()
  const user = userEvent.setup()
  render(<CreateUnitForm onCreated={onCreated} onCancel={onCancel} />)
  return { user, onCreated, onCancel }
}

async function fill(user: ReturnType<typeof userEvent.setup>, name: string, abbreviation: string) {
  if (name) await user.type(screen.getByLabelText('Nombre'), name)
  if (abbreviation) await user.type(screen.getByLabelText('Abreviatura'), abbreviation)
}

function submit(user: ReturnType<typeof userEvent.setup>) {
  return user.click(screen.getByRole('button', { name: 'Registrar unidad' }))
}

beforeEach(() => {
  vi.resetAllMocks()
  listUnits.mockResolvedValue(pageOf([kilogram]))
  createUnit.mockResolvedValue(gram)
})

describe('CreateUnitForm', () => {
  it('sends the trimmed name and abbreviation', async () => {
    const { user, onCreated } = renderForm()

    await fill(user, ' Gramo ', ' g ')
    await submit(user)

    await waitFor(() =>
      expect(createUnit).toHaveBeenCalledWith({ name: 'Gramo', abbreviation: 'g' }, 'test-token'),
    )
    expect(onCreated).toHaveBeenCalledWith(gram)
  })

  it('asks for both fields', async () => {
    const { user } = renderForm()

    await submit(user)

    expect(await screen.findByText('Ingresa el nombre de la unidad')).toBeInTheDocument()
    expect(screen.getByText('Ingresa la abreviatura')).toBeInTheDocument()
    expect(createUnit).not.toHaveBeenCalled()
  })

  it.each([
    ['Caja', 'und', 'El nombre debe tener al menos 5 caracteres'],
    ['N'.repeat(51), 'und', 'El nombre no puede superar 50 caracteres'],
    ['Unidad', 'u'.repeat(11), 'La abreviatura no puede superar 10 caracteres'],
    ['Unidad', 'u nd', 'La abreviatura no lleva espacios'],
  ])('validates %s / %s', async (name, abbreviation, message) => {
    const { user } = renderForm()

    await fill(user, name, abbreviation)
    await submit(user)

    expect(await screen.findByText(message)).toBeInTheDocument()
    expect(createUnit).not.toHaveBeenCalled()
  })

  it('blocks a name that already exists, ignoring case', async () => {
    const { user } = renderForm()

    await fill(user, 'KILOGRAMO', 'kgr')
    await submit(user)

    expect(
      await screen.findByText('Ya existe la unidad "Kilogramo". Usa un nombre diferente.'),
    ).toBeInTheDocument()
    expect(createUnit).not.toHaveBeenCalled()
  })

  it('blocks an abbreviation that already exists, ignoring case', async () => {
    const { user } = renderForm()

    await fill(user, 'Kilos', 'KG')
    await submit(user)

    expect(
      await screen.findByText('La abreviatura "kg" ya la usa la unidad Kilogramo.'),
    ).toBeInTheDocument()
    expect(screen.getByLabelText('Abreviatura')).toHaveFocus()
    expect(createUnit).not.toHaveBeenCalled()
  })

  it('checks every page of units before registering', async () => {
    listUnits
      .mockResolvedValueOnce(pageOf([kilogram], 1, 2))
      .mockResolvedValueOnce(pageOf([gram], 2, 2))
    const { user } = renderForm()

    await fill(user, 'Gramos', 'G')
    await submit(user)

    expect(
      await screen.findByText('La abreviatura "g" ya la usa la unidad Gramo.'),
    ).toBeInTheDocument()
    expect(listUnits).toHaveBeenNthCalledWith(2, { page: 2, limit: 100 }, 'test-token')
  })

  it.each([
    [
      'UNIT_NAME_ALREADY_EXISTS',
      'Nombre',
      'Ya existe una unidad con ese nombre. Usa uno diferente.',
    ],
    [
      'UNIT_ABBREVIATION_ALREADY_EXISTS',
      'Abreviatura',
      'Esa abreviatura ya la usa otra unidad. Usa una diferente.',
    ],
  ])('shows the %s conflict on its field', async (code, label, message) => {
    createUnit.mockRejectedValue(new ApiError('Conflict', 409, {}, code))
    const { user, onCreated } = renderForm()

    await fill(user, 'Gramo', 'g')
    await submit(user)

    expect(await screen.findByText(message)).toBeInTheDocument()
    expect(screen.getByLabelText(label)).toHaveAttribute('aria-invalid', 'true')
    expect(onCreated).not.toHaveBeenCalled()
  })

  it.each([
    [new ApiError('Forbidden', 403), 'No tienes permiso para realizar esta acción.'],
    [new Error('boom'), 'No fue posible registrar la unidad. Intenta de nuevo.'],
  ])('shows the api error (%s)', async (error, message) => {
    createUnit.mockRejectedValue(error)
    const { user } = renderForm()

    await fill(user, 'Gramo', 'g')
    await submit(user)

    expect(await screen.findByRole('alert')).toHaveTextContent(message)
  })

  it('cancels without saving', async () => {
    const { user, onCancel } = renderForm()

    await user.click(screen.getByRole('button', { name: 'Cancelar' }))

    expect(onCancel).toHaveBeenCalledTimes(1)
    expect(createUnit).not.toHaveBeenCalled()
  })
})
