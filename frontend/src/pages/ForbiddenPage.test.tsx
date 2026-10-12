import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { AppRouter } from '../routes/AppRouter'
import { http, setForbiddenHandler } from '../services/http'

const auth = vi.hoisted(() => ({ role: 'BRANCH_ASSISTANT' }))

vi.mock('../hooks/useAuth', () => ({
  useAuth: () => ({
    token: 'test-token',
    user: { id: 'me', fullName: 'Yulieth Tarazona', role: { name: auth.role } },
  }),
}))

vi.mock('../layouts/AppLayout', () => ({
  AppLayout: ({ title, children }: { title: string; children: ReactNode }) => (
    <main>
      <h1>{title}</h1>
      {children}
    </main>
  ),
}))

function renderAt(path: string) {
  const user = userEvent.setup()
  render(
    <MemoryRouter initialEntries={[path]}>
      <AppRouter />
    </MemoryRouter>,
  )
  return { user }
}

function forbiddenResponse() {
  return new Response(
    JSON.stringify({
      error: { code: 'INSUFFICIENT_PERMISSIONS', message: 'Forbidden', details: {} },
    }),
    { status: 403, headers: { 'Content-Type': 'application/json' } },
  )
}

beforeEach(() => {
  auth.role = 'BRANCH_ASSISTANT'
  window.history.replaceState(null, '')
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('ForbiddenPage from the route guard', () => {
  it('shows the 403 page when the role cannot open the route', async () => {
    renderAt('/usuarios')

    expect(
      await screen.findByRole('heading', { name: 'No tienes permiso para ver esta página' }),
    ).toBeInTheDocument()
    expect(
      screen.getByText(/Tu rol \(Ayudante de Sede\) no tiene acceso a este módulo/),
    ).toBeInTheDocument()
    expect(screen.getByText('/usuarios')).toBeInTheDocument()
  })

  it('offers to go back to the dashboard', async () => {
    const { user } = renderAt('/auditoria')

    await user.click(await screen.findByRole('link', { name: 'Volver al dashboard' }))

    expect(await screen.findByRole('heading', { name: 'Dashboard' })).toBeInTheDocument()
  })

  it('hides "Volver atrás" when there is no previous page', async () => {
    renderAt('/sedes')

    await screen.findByRole('heading', { name: 'No tienes permiso para ver esta página' })
    expect(screen.queryByRole('button', { name: 'Volver atrás' })).not.toBeInTheDocument()
  })

  it('goes back to the previous page with "Volver atrás"', async () => {
    window.history.replaceState({ idx: 1 }, '')
    const user = userEvent.setup()
    render(
      <MemoryRouter initialEntries={['/anterior', '/sin-permiso']} initialIndex={1}>
        <Routes>
          <Route path="/anterior" element={<p>Página anterior</p>} />
          <Route path="*" element={<AppRouter />} />
        </Routes>
      </MemoryRouter>,
    )

    await user.click(await screen.findByRole('button', { name: 'Volver atrás' }))

    expect(await screen.findByText('Página anterior')).toBeInTheDocument()
  })
})

describe('ForbiddenPage from the HTTP client', () => {
  it('opens the 403 page when loading data answers 403', async () => {
    auth.role = 'SUPERADMIN'
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(() => Promise.resolve(forbiddenResponse())),
    )
    renderAt('/clientes')

    expect(
      await screen.findByRole('heading', { name: 'No tienes permiso para ver esta página' }),
    ).toBeInTheDocument()
    expect(screen.getByText('/clientes')).toBeInTheDocument()
  })
})

describe('http client 403 handling', () => {
  afterEach(() => {
    setForbiddenHandler(null)
  })

  it('calls the forbidden handler for a GET that answers 403', async () => {
    const handler = vi.fn()
    setForbiddenHandler(handler)
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(forbiddenResponse()))

    await expect(http.get('/customers', { token: 't' })).rejects.toMatchObject({ status: 403 })

    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('leaves the 403 of an action to the form that sent it', async () => {
    const handler = vi.fn()
    setForbiddenHandler(handler)
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(forbiddenResponse()))

    await expect(
      http.patch('/customers/1/status', { active: false }, { token: 't' }),
    ).rejects.toMatchObject({
      status: 403,
    })

    await waitFor(() => expect(handler).not.toHaveBeenCalled())
  })
})
