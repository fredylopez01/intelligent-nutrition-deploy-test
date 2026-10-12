import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { categoriesService } from '../../services/categories.service'
import { ApiError } from '../../services/http'
import type { Category } from '../../types/category'

import { CreateCategoryForm } from './CreateCategoryForm'

vi.mock('../../services/categories.service', () => ({
  categoriesService: { list: vi.fn(), create: vi.fn() },
}))

vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({ token: 'test-token' }),
}))

const listCategories = vi.mocked(categoriesService.list)
const createCategory = vi.mocked(categoriesService.create)

const proteins: Category = {
  id: 'cat-1',
  name: 'Proteínas',
  description: 'Suplementos de proteína',
  active: true,
}

function listOf(data: Category[]) {
  return { data, meta: { page: 1, limit: 100, total: data.length, totalPages: 1 } }
}

function renderForm() {
  const onCreated = vi.fn()
  const onCancel = vi.fn()
  const user = userEvent.setup()
  render(<CreateCategoryForm onCreated={onCreated} onCancel={onCancel} />)
  return { user, onCreated, onCancel }
}

async function fill(
  user: ReturnType<typeof userEvent.setup>,
  { name, description }: { name: string; description: string },
) {
  if (name) await user.type(screen.getByLabelText('Nombre'), name)
  if (description) await user.type(screen.getByLabelText('Descripción'), description)
}

function submit(user: ReturnType<typeof userEvent.setup>) {
  return user.click(screen.getByRole('button', { name: 'Registrar categoría' }))
}

beforeEach(() => {
  vi.resetAllMocks()
  listCategories.mockResolvedValue(listOf([]))
  createCategory.mockResolvedValue(proteins)
})

describe('CreateCategoryForm', () => {
  it('sends the trimmed name and description and returns the new category', async () => {
    const { user, onCreated } = renderForm()

    await fill(user, { name: '  Proteínas ', description: ' Suplementos de proteína ' })
    await submit(user)

    await waitFor(() =>
      expect(createCategory).toHaveBeenCalledWith(
        { name: 'Proteínas', description: 'Suplementos de proteína' },
        'test-token',
      ),
    )
    expect(onCreated).toHaveBeenCalledWith(proteins)
  })

  it('asks for the name and the description', async () => {
    const { user } = renderForm()

    await submit(user)

    expect(await screen.findByText('Ingresa el nombre de la categoría')).toBeInTheDocument()
    expect(screen.getByText('Ingresa una descripción')).toBeInTheDocument()
    expect(createCategory).not.toHaveBeenCalled()
  })

  it.each([
    ['Pr', 'El nombre debe tener al menos 3 caracteres'],
    ['   ', 'Ingresa el nombre de la categoría'],
    ['N'.repeat(101), 'El nombre no puede superar 100 caracteres'],
  ])('validates the length of the name "%s"', async (name, message) => {
    const { user } = renderForm()

    await fill(user, { name, description: 'Descripción' })
    await submit(user)

    expect(await screen.findByText(message)).toBeInTheDocument()
    expect(createCategory).not.toHaveBeenCalled()
  })

  it('accepts a name of exactly 3 and 100 characters', async () => {
    const { user } = renderForm()

    await fill(user, { name: 'Pro', description: 'Descripción' })
    await submit(user)
    await waitFor(() => expect(createCategory).toHaveBeenCalledTimes(1))

    await user.clear(screen.getByLabelText('Nombre'))
    await user.type(screen.getByLabelText('Nombre'), 'N'.repeat(100))
    await submit(user)
    await waitFor(() => expect(createCategory).toHaveBeenCalledTimes(2))
  })

  it('limits the description to 255 characters and counts them', async () => {
    const { user } = renderForm()

    await user.type(screen.getByLabelText('Descripción'), 'Barras')

    expect(screen.getByLabelText('Descripción')).toHaveAttribute('maxLength', '255')
    expect(screen.getByText('6/255')).toBeInTheDocument()
  })

  it('blocks a name that already exists, ignoring case and spaces', async () => {
    listCategories.mockResolvedValue(listOf([proteins]))
    const { user, onCreated } = renderForm()

    await fill(user, { name: ' PROTEÍNAS ', description: 'Otra descripción' })
    await submit(user)

    expect(
      await screen.findByText('Ya existe la categoría "Proteínas". Usa un nombre diferente.'),
    ).toBeInTheDocument()
    expect(listCategories).toHaveBeenCalledWith({ search: 'PROTEÍNAS', limit: 100 }, 'test-token')
    expect(createCategory).not.toHaveBeenCalled()
    expect(onCreated).not.toHaveBeenCalled()
    expect(screen.getByLabelText('Nombre')).toHaveFocus()
  })

  it('does not confuse a similar name with a duplicate', async () => {
    listCategories.mockResolvedValue(listOf([proteins]))
    const { user } = renderForm()

    await fill(user, { name: 'Proteínas veganas', description: 'Proteína vegetal' })
    await submit(user)

    await waitFor(() => expect(createCategory).toHaveBeenCalledTimes(1))
  })

  it('shows the duplicate error the api returns', async () => {
    createCategory.mockRejectedValue(
      new ApiError('Category exists', 409, {}, 'CATEGORY_NAME_ALREADY_EXISTS'),
    )
    const { user, onCreated } = renderForm()

    await fill(user, { name: 'Proteínas', description: 'Suplementos' })
    await submit(user)

    expect(
      await screen.findByText('Ya existe una categoría con ese nombre. Usa uno diferente.'),
    ).toBeInTheDocument()
    expect(onCreated).not.toHaveBeenCalled()
  })

  it('still registers when the duplicate check cannot be done', async () => {
    listCategories.mockRejectedValue(new Error('offline'))
    const { user, onCreated } = renderForm()

    await fill(user, { name: 'Proteínas', description: 'Suplementos' })
    await submit(user)

    await waitFor(() => expect(onCreated).toHaveBeenCalledWith(proteins))
  })

  it.each([
    [new ApiError('Forbidden', 403), 'No tienes permiso para realizar esta acción.'],
    [new Error('boom'), 'No fue posible registrar la categoría. Intenta de nuevo.'],
  ])('shows the api error (%s)', async (error, message) => {
    createCategory.mockRejectedValue(error)
    const { user, onCreated } = renderForm()

    await fill(user, { name: 'Proteínas', description: 'Suplementos' })
    await submit(user)

    expect(await screen.findByRole('alert')).toHaveTextContent(message)
    expect(onCreated).not.toHaveBeenCalled()
  })

  it('cancels without saving', async () => {
    const { user, onCancel } = renderForm()

    await user.click(screen.getByRole('button', { name: 'Cancelar' }))

    expect(onCancel).toHaveBeenCalledTimes(1)
    expect(createCategory).not.toHaveBeenCalled()
  })
})
