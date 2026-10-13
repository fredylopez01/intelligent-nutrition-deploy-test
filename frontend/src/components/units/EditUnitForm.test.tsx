import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ApiError } from '../../services/http'
import { unitsService } from '../../services/units.service'
import type { UnitOfMeasure } from '../../types/unit'

import { EditUnitForm } from './EditUnitForm'

vi.mock('../../services/units.service', () => ({
  unitsService: { list: vi.fn(), update: vi.fn() },
}))

vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({ token: 'test-token' }),
}))

const listUnits = vi.mocked(unitsService.list)
const updateUnit = vi.mocked(unitsService.update)

const gram: UnitOfMeasure = { id: 'unit-1', name: 'Gramo', abbreviation: 'g', active: true }
const kilogram: UnitOfMeasure = {
  id: 'unit-2',
  name: 'Kilogramo',
  abbreviation: 'kg',
  active: true,
}

function renderForm(unit: UnitOfMeasure = gram) {
  const onUpdated = vi.fn()
  const onCancel = vi.fn()
  const user = userEvent.setup()
  render(<EditUnitForm unit={unit} onUpdated={onUpdated} onCancel={onCancel} />)
  return { user, onUpdated, onCancel }
}

async function replace(user: ReturnType<typeof userEvent.setup>, label: string, value: string) {
  await user.clear(screen.getByLabelText(label))
  if (value) await user.type(screen.getByLabelText(label), value)
}

function save(user: ReturnType<typeof userEvent.setup>) {
  return user.click(screen.getByRole('button', { name: 'Guardar cambios' }))
}

beforeEach(() => {
  vi.resetAllMocks()
  listUnits.mockResolvedValue({
    data: [gram, kilogram],
    meta: { page: 1, limit: 100, total: 2, totalPages: 1 },
  })
  updateUnit.mockImplementation((id, payload) => Promise.resolve({ ...gram, ...payload, id }))
})

describe('EditUnitForm', () => {
  it('preloads the name and abbreviation', () => {
    renderForm()

    expect(screen.getByLabelText('Nombre')).toHaveValue('Gramo')
    expect(screen.getByLabelText('Abreviatura')).toHaveValue('g')
  })

  it('sends only what changed and returns the updated unit', async () => {
    const { user, onUpdated } = renderForm()

    await replace(user, 'Abreviatura', ' gr ')
    await save(user)

    await waitFor(() =>
      expect(updateUnit).toHaveBeenCalledWith('unit-1', { abbreviation: 'gr' }, 'test-token'),
    )
    expect(onUpdated).toHaveBeenCalledWith(expect.objectContaining({ abbreviation: 'gr' }))
  })

  it('does not call the api when nothing changed', async () => {
    const { user } = renderForm()

    await save(user)

    expect(await screen.findByRole('alert')).toHaveTextContent('No hay cambios por guardar.')
    expect(updateUnit).not.toHaveBeenCalled()
  })

  it('blocks an abbreviation used by another unit, ignoring case', async () => {
    const { user } = renderForm()

    await replace(user, 'Abreviatura', 'KG')
    await save(user)

    expect(
      await screen.findByText('La abreviatura "kg" ya la usa la unidad Kilogramo.'),
    ).toBeInTheDocument()
    expect(updateUnit).not.toHaveBeenCalled()
  })

  it('does not treat its own name as a duplicate', async () => {
    const { user } = renderForm()

    await replace(user, 'Nombre', 'GRAMO')
    await save(user)

    await waitFor(() =>
      expect(updateUnit).toHaveBeenCalledWith('unit-1', { name: 'GRAMO' }, 'test-token'),
    )
  })

  it.each([
    [
      'Unit measure name already exists',
      'Nombre',
      'Ya existe una unidad con ese nombre. Usa uno diferente.',
    ],
    [
      'Unit measure abreviation already exists',
      'Abreviatura',
      'Esa abreviatura ya la usa otra unidad. Usa una diferente.',
    ],
  ])('shows the conflict "%s" on its field', async (apiMessage, label, message) => {
    updateUnit.mockRejectedValue(new ApiError(apiMessage, 409, {}, 'CONFLICT'))
    const { user } = renderForm()

    await replace(user, 'Nombre', 'Gramos')
    await replace(user, 'Abreviatura', 'grs')
    await save(user)

    expect(await screen.findByText(message)).toBeInTheDocument()
    expect(screen.getByLabelText(label)).toHaveAttribute('aria-invalid', 'true')
  })

  it('validates like the registration', async () => {
    const { user } = renderForm()

    await replace(user, 'Nombre', 'Caja')
    await replace(user, 'Abreviatura', 'c j')
    await save(user)

    expect(
      await screen.findByText('El nombre debe tener al menos 5 caracteres'),
    ).toBeInTheDocument()
    expect(screen.getByText('La abreviatura no lleva espacios')).toBeInTheDocument()
    expect(updateUnit).not.toHaveBeenCalled()
  })

  it('shows any other api error', async () => {
    updateUnit.mockRejectedValue(new ApiError('Not found', 404))
    const { user } = renderForm()

    await replace(user, 'Nombre', 'Gramos')
    await save(user)

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Esta unidad ya no existe. Recarga el listado.',
    )
  })

  it('cancels without saving', async () => {
    const { user, onCancel } = renderForm()

    await user.click(screen.getByRole('button', { name: 'Cancelar' }))

    expect(onCancel).toHaveBeenCalledTimes(1)
  })
})
