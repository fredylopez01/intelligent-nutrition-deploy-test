import { beforeEach, describe, expect, it, vi } from 'vitest'

import { http } from './http'
import { unitsService } from './units.service'

vi.mock('./http', () => ({
  http: { get: vi.fn(), post: vi.fn(), patch: vi.fn() },
}))

const get = vi.mocked(http.get)
const post = vi.mocked(http.post)
const patch = vi.mocked(http.patch)

const apiUnit = {
  id: 'unit-1',
  name: 'Kilogramo',
  abreviation: 'kg',
  active: true,
  createdAt: '2026-10-07T15:30:00Z',
  updatedAt: '2026-10-07T15:30:00Z',
}

beforeEach(() => {
  vi.resetAllMocks()
})

describe('unitsService', () => {
  it('lists the units with the backend path and filters', async () => {
    get.mockResolvedValue({
      data: [apiUnit],
      meta: { page: 2, limit: 20, total: 21, totalPages: 2 },
    })

    const response = await unitsService.list(
      { page: 2, limit: 20, search: 'kilo', active: true },
      'token',
    )

    expect(get).toHaveBeenCalledWith('/unit-measure?page=2&limit=20&search=kilo&active=true', {
      token: 'token',
    })
    expect(response.data[0]).toEqual({
      id: 'unit-1',
      name: 'Kilogramo',
      abbreviation: 'kg',
      active: true,
      createdAt: '2026-10-07T15:30:00Z',
      updatedAt: '2026-10-07T15:30:00Z',
    })
    expect(response.meta.total).toBe(21)
  })

  it('sends the abbreviation with the name the backend expects', async () => {
    post.mockResolvedValue(apiUnit)

    const unit = await unitsService.create({ name: 'Kilogramo', abbreviation: 'kg' }, 'token')

    expect(post).toHaveBeenCalledWith(
      '/unit-measure',
      { name: 'Kilogramo', abreviation: 'kg' },
      { token: 'token' },
    )
    expect(unit.abbreviation).toBe('kg')
    expect(unit).not.toHaveProperty('abreviation')
  })

  it('updates only the fields sent, with the name the backend expects', async () => {
    patch.mockResolvedValue({ ...apiUnit, abreviation: 'kgs' })

    const unit = await unitsService.update('unit-1', { abbreviation: 'kgs' }, 'token')

    expect(patch).toHaveBeenCalledWith(
      '/unit-measure/unit-1',
      { abreviation: 'kgs' },
      { token: 'token' },
    )
    expect(unit.abbreviation).toBe('kgs')
  })

  it('changes the state', async () => {
    patch.mockResolvedValue({ message: 'ok' })

    await unitsService.updateStatus('unit-1', { active: false }, 'token')

    expect(patch).toHaveBeenCalledWith(
      '/unit-measure/unit-1/status',
      { active: false },
      { token: 'token' },
    )
  })
})
