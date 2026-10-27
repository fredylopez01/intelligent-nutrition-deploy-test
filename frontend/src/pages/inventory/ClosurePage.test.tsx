import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { branchesService } from '../../services/branches.service'
import { ApiError } from '../../services/http'
import { inventoryClosuresService } from '../../services/inventoryClosures.service'
import { buildClosure, buildSummary } from '../../test-utils/inventoryClosures'
import type { ClosureSummary, ClosuresListParams } from '../../types/inventoryClosure'

import { ClosurePage } from './ClosurePage'

const auth = vi.hoisted(() => ({
  role: 'BRANCH_LEADER',
  branches: [] as { id: string; name: string }[],
}))

vi.mock('../../services/inventoryClosures.service', () => ({
  inventoryClosuresService: {
    start: vi.fn(),
    get: vi.fn(),
    list: vi.fn(),
    saveCounts: vi.fn(),
  },
}))

vi.mock('../../services/branches.service', () => ({
  branchesService: { list: vi.fn() },
}))

vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({
    token: 'test-token',
    user: { id: 'me', role: { name: auth.role }, branches: auth.branches },
  }),
}))

vi.mock('../../layouts/AppLayout', () => ({
  AppLayout: ({ title, children }: { title: string; children: ReactNode }) => (
    <main>
      <h1>{title}</h1>
      {children}
    </main>
  ),
}))

const list = vi.mocked(inventoryClosuresService.list)
const get = vi.mocked(inventoryClosuresService.get)

const yesterday = buildSummary({ id: 'closure-yesterday', closureDate: '2026-10-25' })

function page(data: ClosureSummary[]) {
  return { data, meta: { page: 1, limit: 10, total: data.length, totalPages: data.length ? 1 : 0 } }
}

function isTodayQuery(params: ClosuresListParams) {
  return params.from === '2026-10-26' && params.to === '2026-10-26' && params.limit === 1
}

function mockClosures(today: ClosureSummary | null, history: ClosureSummary[] = [yesterday]) {
  list.mockImplementation((params) =>
    Promise.resolve(page(isTodayQuery(params) ? (today ? [today] : []) : history)),
  )
}

function renderPage(path = '/inventario/cierre') {
  const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime.bind(vi) })
  render(
    <MemoryRouter initialEntries={[path]}>
      <ClosurePage />
    </MemoryRouter>,
  )
  return { user }
}

beforeEach(() => {
  vi.useFakeTimers({ now: new Date('2026-10-26T20:00:00.000Z'), shouldAdvanceTime: true })
  vi.resetAllMocks()
  auth.role = 'BRANCH_LEADER'
  auth.branches = [{ id: 'branch-centro', name: 'Centro' }]
  mockClosures(null)
})

afterEach(() => {
  vi.useRealTimers()
})

describe('ClosurePage today', () => {
  it('offers to start the closure when the branch has none today', async () => {
    renderPage()

    expect(
      await screen.findByRole('button', { name: 'Iniciar cierre del día' }),
    ).toBeInTheDocument()
    expect(list).toHaveBeenCalledWith(
      { branchId: 'branch-centro', from: '2026-10-26', to: '2026-10-26', page: 1, limit: 1 },
      'test-token',
    )
  })

  it('moves to the blind count after starting', async () => {
    vi.mocked(inventoryClosuresService.start).mockResolvedValue(buildClosure())
    const { user } = renderPage()

    await user.click(await screen.findByRole('button', { name: 'Iniciar cierre del día' }))

    expect(await screen.findByText('Conteo ciego de Centro')).toBeInTheDocument()
    expect(screen.getByRole('table', { name: 'Lotes a contar' })).toBeInTheDocument()
  })

  it('continues the pending count of today', async () => {
    mockClosures(buildSummary({ id: 'closure-1', closureDate: '2026-10-26', status: 'PENDING' }))
    get.mockResolvedValue(buildClosure())
    renderPage()

    expect(await screen.findByText('Conteo ciego de Centro')).toBeInTheDocument()
    expect(get).toHaveBeenCalledWith('closure-1', 'test-token')
  })

  it('tells that the closure of today is already closed', async () => {
    mockClosures(buildSummary({ id: 'closure-1', closureDate: '2026-10-26' }))
    get.mockResolvedValue(buildClosure({ status: 'CONFIRMED', locked: true, confirmed: true }))
    renderPage()

    expect(await screen.findByText(/El cierre de hoy ya se cerró/)).toBeInTheDocument()
  })

  it('shows the error of today and retries', async () => {
    list.mockRejectedValueOnce(new ApiError('Boom', 500, {}, 'INTERNAL'))
    const { user } = renderPage()

    expect(
      await screen.findByText('No fue posible revisar el cierre de hoy. Intenta de nuevo.'),
    ).toBeInTheDocument()
    mockClosures(null)
    await user.click(screen.getAllByRole('button', { name: 'Reintentar' })[0])

    expect(
      await screen.findByRole('button', { name: 'Iniciar cierre del día' }),
    ).toBeInTheDocument()
  })

  it('does not offer the count to the superadmin', async () => {
    auth.role = 'SUPERADMIN'
    auth.branches = []
    vi.mocked(branchesService.list).mockResolvedValue({
      data: [{ id: 'branch-centro', name: 'Centro', active: true, address: 'Calle 1', phone: '3' }],
      meta: { page: 1, limit: 100, total: 1, totalPages: 1 },
    } as never)
    renderPage()

    expect(await screen.findByRole('option', { name: 'Centro' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Iniciar cierre del día' })).not.toBeInTheDocument()
    expect(list).not.toHaveBeenCalled()
  })
})
