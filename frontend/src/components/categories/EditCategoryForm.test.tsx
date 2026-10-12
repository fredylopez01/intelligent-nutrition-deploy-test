import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { categoriesService } from '../../services/categories.service'
import { ApiError } from '../../services/http'
import type { Category } from '../../types/category'

import { EditCategoryForm } from './EditCategoryForm'

vi.mock('../../services/categories.service', () => ({
  categoriesService: { list: vi.fn(), update: vi.fn() },
}))

vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({ token: 'test-token' }),
}))

const listCategories = vi.mocked(categoriesService.list)
const updateCategory = vi.mocked(categoriesService.update)

const vitamins: Category = {
  id: 'cat-2',
  name: 'Vitaminas',
  description: 'Multivitamínicos',
  active: true,
  createdAt: '2026-10-07T15:30:00Z',
}

const proteins: Category = {
  id: 'cat-1',
  name: 'Proteínas',
  description: 'Suplementos de proteína',
  active: true,
}

function listOf(data: Category[]) {
  return { data, meta: { page: 1, limit: 100, total: data.length, totalPages: 1 } }
}

function renderForm(category: Category = vitamins) {
  const onUpdated = vi.fn()
  const onCancel = vi.fn()
  const user = userEvent.setup()
  render(<EditCategoryForm category={category} onUpdated={onUpdated} onCancel={onCancel} />)
  return { user, onUpdated, onCancel }
}

function save(user: ReturnType<typeof userEvent.setup>) {
  return user.click(screen.getByRole('button', { name: 'Guardar cambios' }))
}

async function replace(user: ReturnType<typeof userEvent.setup>, label: string, value: string) {
  await user.clear(screen.getByLabelText(label))
  if (value) await user.type(screen.getByLabelText(label), value)
}

beforeEach(() => {
  vi.resetAllMocks()
  listCategories.mockResolvedValue(listOf([vitamins]))
  updateCategory.mockImplementation((id, payload) =>
    Promise.resolve({ ...vitamins, ...payload, id }),
  )
})

describe('EditCategoryForm', () => {
  it('preloads the current name and description', () => {
    renderForm()

    expect(screen.getByLabelText('Nombre')).toHaveValue('Vitaminas')
    expect(screen.getByLabelText('Descripción')).toHaveValue('Multivitamínicos')
    expect(screen.getByText('16/255')).toBeInTheDocument()
  })

  it('sends only the fields that changed', async () => {
    const { user, onUpdated } = renderForm()

    await replace(user, 'Descripción', ' Vitaminas y minerales ')
    await save(user)

    await waitFor(() =>
      expect(updateCategory).toHaveBeenCalledWith(
        'cat-2',
        { description: 'Vitaminas y minerales' },
        'test-token',
      ),
    )
    expect(listCategories).not.toHaveBeenCalled()
    expect(onUpdated).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'cat-2', description: 'Vitaminas y minerales' }),
    )
  })

  it('renames the category after checking the new name is free', async () => {
    const { user, onUpdated } = renderForm()

    await replace(user, 'Nombre', 'Vitaminas y minerales')
    await save(user)

    await waitFor(() =>
      expect(updateCategory).toHaveBeenCalledWith(
        'cat-2',
        { name: 'Vitaminas y minerales' },
        'test-token',
      ),
    )
    expect(onUpdated).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Vitaminas y minerales', createdAt: vitamins.createdAt }),
    )
  })

  it('does not call the api when nothing changed', async () => {
    const { user } = renderForm()

    await replace(user, 'Nombre', ' Vitaminas ')
    await save(user)

    expect(await screen.findByRole('alert')).toHaveTextContent('No hay cambios por guardar.')
    expect(updateCategory).not.toHaveBeenCalled()
  })

  it('blocks a name used by another category, ignoring case', async () => {
    listCategories.mockResolvedValue(listOf([proteins]))
    const { user, onUpdated } = renderForm()

    await replace(user, 'Nombre', 'proteínas')
    await save(user)

    expect(
      await screen.findByText('Ya existe la categoría "Proteínas". Usa un nombre diferente.'),
    ).toBeInTheDocument()
    expect(updateCategory).not.toHaveBeenCalled()
    expect(onUpdated).not.toHaveBeenCalled()
  })

  it('lets the same category change only the case of its name', async () => {
    const { user } = renderForm()

    await replace(user, 'Nombre', 'VITAMINAS')
    await save(user)

    await waitFor(() =>
      expect(updateCategory).toHaveBeenCalledWith('cat-2', { name: 'VITAMINAS' }, 'test-token'),
    )
    expect(listCategories).not.toHaveBeenCalled()
  })

  it('validates like the registration', async () => {
    const { user } = renderForm()

    await replace(user, 'Nombre', 'Vi')
    await replace(user, 'Descripción', '')
    await save(user)

    expect(
      await screen.findByText('El nombre debe tener al menos 3 caracteres'),
    ).toBeInTheDocument()
    expect(screen.getByText('Ingresa una descripción')).toBeInTheDocument()
    expect(updateCategory).not.toHaveBeenCalled()
  })

  it('shows the duplicate conflict the api returns on the name', async () => {
    updateCategory.mockRejectedValue(
      new ApiError('Category name already exists', 409, {}, 'CONFLICT'),
    )
    const { user } = renderForm()

    await replace(user, 'Nombre', 'Minerales')
    await save(user)

    expect(
      await screen.findByText('Ya existe una categoría con ese nombre. Usa uno diferente.'),
    ).toBeInTheDocument()
  })

  it.each([
    [new ApiError('Not found', 404), 'Esta categoría ya no existe. Recarga el listado.'],
    [new ApiError('Forbidden', 403), 'No tienes permiso para realizar esta acción.'],
    [new Error('boom'), 'No fue posible guardar los cambios. Intenta de nuevo.'],
  ])('shows the api error (%s)', async (error, message) => {
    updateCategory.mockRejectedValue(error)
    const { user, onUpdated } = renderForm()

    await replace(user, 'Descripción', 'Nueva descripción')
    await save(user)

    expect(await screen.findByRole('alert')).toHaveTextContent(message)
    expect(onUpdated).not.toHaveBeenCalled()
  })

  it('cancels without saving', async () => {
    const { user, onCancel } = renderForm()

    await user.click(screen.getByRole('button', { name: 'Cancelar' }))

    expect(onCancel).toHaveBeenCalledTimes(1)
    expect(updateCategory).not.toHaveBeenCalled()
  })
})
