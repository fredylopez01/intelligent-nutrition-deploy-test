import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { auditLogsService } from '../../services/auditLogs.service'
import { usersService } from '../../services/users.service'
import type { AuditLog, AuditLogsListResponse } from '../../types/auditLog'
import type { User, UsersListResponse } from '../../types/user'

import { AuditLogsPage } from './AuditLogsPage'

vi.mock('../../services/auditLogs.service', () => ({
  auditLogsService: { list: vi.fn() },
}))

vi.mock('../../services/users.service', () => ({
  usersService: { list: vi.fn() },
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

const listLogs = vi.mocked(auditLogsService.list)
const listUsers = vi.mocked(usersService.list)

const affectedUser: User = {
  id: 'user-1',
  personId: 'person-1',
  person: {
    id: 'person-1',
    firstName: 'María',
    lastName: 'Pérez',
    email: 'maria@intelligent.co',
    phone: '3001112233',
    address: 'Calle 1 # 2-3',
  },
  role: { id: 'role-1', name: 'BRANCH_ASSISTANT' },
  branches: [],
  active: true,
  mustChangePassword: false,
  lastLoginAt: null,
  createdAt: '2026-09-01T10:00:00.000Z',
  updatedAt: '2026-09-01T10:00:00.000Z',
}

function makeLog(overrides: Partial<AuditLog> = {}): AuditLog {
  return {
    id: 'log-1',
    userId: 'user-1',
    action: 'UPDATE',
    entity: 'USER',
    entityId: 'user-1',
    oldData: { firstName: 'Ana' },
    newData: { firstName: 'María' },
    reason: 'Cambio de nombre registrado',
    ipAddress: '127.0.0.1',
    createdAt: '2026-09-15T08:30:00.000Z',
    userAccount: {
      person: {
        id: 'person-9',
        firstName: 'Admin',
        lastName: 'Sistema',
        email: 'admin@intelligent.co',
      },
    },
    ...overrides,
  }
}

function pageOf(
  data: AuditLog[],
  extra: Partial<AuditLogsListResponse> = {},
): AuditLogsListResponse {
  return {
    data,
    meta: { page: 1, limit: 10, total: data.length, totalPages: data.length ? 1 : 0 },
    ...extra,
  }
}

function usersResponse(data: User[] = [affectedUser]): UsersListResponse {
  return { data, meta: { page: 1, limit: 100, total: data.length, totalPages: 1 } }
}

function lastListParams() {
  const call = listLogs.mock.lastCall
  if (!call) throw new Error('The audit logs list was never requested')
  return call[0]
}

function renderPage() {
  const user = userEvent.setup()
  render(<AuditLogsPage />)
  return { user }
}

beforeEach(() => {
  vi.resetAllMocks()
  listUsers.mockResolvedValue(usersResponse())
  listLogs.mockResolvedValue(pageOf([makeLog()]))
})

describe('AuditLogsPage filters', () => {
  it('loads the first page without filters', async () => {
    renderPage()

    expect(await screen.findByRole('cell', { name: /Admin Sistema/ })).toBeInTheDocument()
    expect(lastListParams()).toEqual({
      page: 1,
      limit: 10,
      userId: undefined,
      action: undefined,
      fromDate: undefined,
      toDate: undefined,
    })
    expect(listLogs.mock.calls[0]?.[1]).toBe('test-token')
  })

  it('applies the affected user filter', async () => {
    const { user } = renderPage()
    await screen.findByRole('cell', { name: /Admin Sistema/ })

    await user.selectOptions(screen.getByRole('combobox', { name: 'Usuario afectado' }), 'user-1')

    await waitFor(() => expect(lastListParams()).toMatchObject({ userId: 'user-1', page: 1 }))
  })

  it('applies the action filter', async () => {
    const { user } = renderPage()
    await screen.findByRole('cell', { name: /Admin Sistema/ })

    await user.selectOptions(screen.getByRole('combobox', { name: 'Acción' }), 'UPDATE')

    await waitFor(() => expect(lastListParams()).toMatchObject({ action: 'UPDATE', page: 1 }))
  })

  it('applies the date range filters', async () => {
    const { user } = renderPage()
    await screen.findByRole('cell', { name: /Admin Sistema/ })

    await user.type(screen.getByLabelText('Desde'), '2026-09-01')
    await user.type(screen.getByLabelText('Hasta'), '2026-09-30')

    await waitFor(() =>
      expect(lastListParams()).toMatchObject({
        fromDate: '2026-09-01',
        toDate: '2026-09-30',
        page: 1,
      }),
    )
  })

  it('combines the user, action and date filters in the same request', async () => {
    const { user } = renderPage()
    await screen.findByRole('cell', { name: /Admin Sistema/ })

    await user.selectOptions(screen.getByRole('combobox', { name: 'Usuario afectado' }), 'user-1')
    await user.selectOptions(screen.getByRole('combobox', { name: 'Acción' }), 'UPDATE')
    await user.type(screen.getByLabelText('Desde'), '2026-09-01')
    await user.type(screen.getByLabelText('Hasta'), '2026-09-30')

    await waitFor(() =>
      expect(lastListParams()).toEqual({
        page: 1,
        limit: 10,
        userId: 'user-1',
        action: 'UPDATE',
        fromDate: '2026-09-01',
        toDate: '2026-09-30',
      }),
    )
  })

  it('goes back to the first page when a filter changes', async () => {
    listLogs.mockResolvedValue({
      data: [makeLog()],
      meta: { page: 1, limit: 10, total: 15, totalPages: 2 },
    })
    const { user } = renderPage()

    await user.click(await screen.findByRole('button', { name: 'Siguiente' }))
    await waitFor(() => expect(lastListParams().page).toBe(2))

    await user.selectOptions(screen.getByRole('combobox', { name: 'Acción' }), 'UPDATE')

    await waitFor(() => expect(lastListParams()).toMatchObject({ page: 1, action: 'UPDATE' }))
  })
})

describe('AuditLogsPage empty list', () => {
  it('shows the default empty state when there are no audit logs', async () => {
    listLogs.mockResolvedValue(pageOf([]))
    renderPage()

    expect(await screen.findByText('Todavía no hay registros de auditoría')).toBeInTheDocument()
    expect(
      screen.getByText('Los cambios sobre usuarios y sedes quedarán registrados aquí.'),
    ).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })

  it('shows the message sent by the api for an empty list', async () => {
    listLogs.mockResolvedValue(pageOf([], { message: 'No hay registros de auditoría.' }))
    renderPage()

    expect(await screen.findByText('No hay registros de auditoría.')).toBeInTheDocument()
  })

  it('explains that no record matches when filters are applied', async () => {
    listLogs.mockResolvedValueOnce(pageOf([makeLog()])).mockResolvedValue(pageOf([]))
    const { user } = renderPage()
    await screen.findByRole('cell', { name: /Admin Sistema/ })

    await user.selectOptions(screen.getByRole('combobox', { name: 'Acción' }), 'UPDATE')

    expect(await screen.findByText('Ningún registro coincide con los filtros')).toBeInTheDocument()
    expect(
      screen.getByText('Ajusta el usuario, la acción o el rango de fechas.'),
    ).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })
})
