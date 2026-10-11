import { screen } from '@testing-library/react'
import type userEvent from '@testing-library/user-event'

import type { PersonSearchResult } from '../types/person'

export function buildPerson(overrides: Partial<PersonSearchResult> = {}): PersonSearchResult {
  return {
    id: 'person-laura',
    documentTypeId: 'doc-cc',
    documentNumber: '1049000111',
    firstName: 'Laura',
    lastName: 'Pérez',
    businessName: null,
    email: 'laura@correo.com',
    phone: '3001112233',
    address: 'Calle 20 # 10-15, Tunja',
    relationships: { hasUserAccount: false, isCustomer: false, isSupplier: false },
    ...overrides,
  }
}

export function searchResponse(people: PersonSearchResult[]) {
  return {
    data: people,
    meta: { page: 1, limit: 5, total: people.length, totalPages: people.length > 0 ? 1 : 0 },
  }
}

type User = ReturnType<typeof userEvent.setup>

export async function searchPerson(user: User, term: string) {
  const input = screen.getByRole('searchbox', { name: 'Buscar persona' })
  await user.clear(input)
  await user.type(input, term)
  await user.click(screen.getByRole('button', { name: 'Buscar' }))
}

export async function openNewForm(user: User, term = 'persona nueva') {
  await searchPerson(user, term)
  await user.click(await screen.findByRole('button', { name: 'Crear desde cero' }))
}
