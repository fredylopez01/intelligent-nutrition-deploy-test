import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ApiError } from '../../services/http'
import { inventoryService } from '../../services/inventory.service'
import {
  buildInventoryDetail,
  buildInventoryItem,
  withoutThresholds,
} from '../../test-utils/inventory'

import { InventoryLots } from './InventoryLots'

vi.mock('../../services/inventory.service', () => ({
  inventoryService: { getProductInBranch: vi.fn() },
}))

vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({ token: 'test-token' }),
}))

const getProductInBranch = vi.mocked(inventoryService.getProductInBranch)

beforeEach(() => {
  vi.resetAllMocks()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 5, 20, 10, 0))
})

afterEach(() => {
  vi.useRealTimers()
})

describe('InventoryLots', () => {
  it('lists the lots from the closest expiration and flags the ones about to expire', async () => {
    getProductInBranch.mockResolvedValue(buildInventoryDetail())
    render(<InventoryLots branchId="branch-centro" item={buildInventoryItem()} onClose={vi.fn()} />)

    const table = await screen.findByRole('table')
    const rows = within(table).getAllByRole('row').slice(1)
    expect(rows.map((row) => row.textContent)).toEqual([
      '30 jun 202620 undVence en 10 días',
      '31 dic 202615 undVigente',
    ])
    expect(getProductInBranch).toHaveBeenCalledWith('branch-centro', 'product-whey', 'test-token')
    expect(screen.getByText('35 und')).toBeInTheDocument()
    expect(screen.getByText('8 und')).toBeInTheDocument()
  })

  it('does not show the minimum stock when the role cannot see it', async () => {
    getProductInBranch.mockResolvedValue(withoutThresholds(buildInventoryDetail()))
    render(
      <InventoryLots
        branchId="branch-centro"
        item={withoutThresholds(buildInventoryItem())}
        onClose={vi.fn()}
      />,
    )

    await screen.findByRole('table')
    expect(screen.queryByText('Stock mínimo')).not.toBeInTheDocument()
  })

  it('retries when the lots fail to load', async () => {
    getProductInBranch
      .mockRejectedValueOnce(new ApiError('Error', 500))
      .mockResolvedValueOnce(buildInventoryDetail())
    vi.useRealTimers()
    const user = userEvent.setup()
    render(<InventoryLots branchId="branch-centro" item={buildInventoryItem()} onClose={vi.fn()} />)

    expect(await screen.findByRole('alert')).toHaveTextContent('No fue posible cargar los lotes')
    await user.click(screen.getByRole('button', { name: 'Reintentar' }))

    await waitFor(() => expect(screen.getByRole('table')).toBeInTheDocument())
  })
})
