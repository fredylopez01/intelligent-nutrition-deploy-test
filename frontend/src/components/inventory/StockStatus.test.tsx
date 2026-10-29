import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { LOW_STOCK_TOOLTIP, StockStatus } from './StockStatus'

const warningIcon = () => screen.getByRole('button', { name: 'Advertencia de stock bajo' })

describe('StockStatus', () => {
  it('shows the low-stock indicator when the stock is below the threshold', () => {
    render(<StockStatus totalQuantity={4} lowStock />)

    expect(screen.getByText('Bajo mínimo')).toBeInTheDocument()
  })

  it('shows a warning icon with an alert tooltip on hover and focus', async () => {
    const user = userEvent.setup()
    render(<StockStatus totalQuantity={4} lowStock />)

    expect(warningIcon()).toBeInTheDocument()
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()

    await user.hover(warningIcon())

    expect(screen.getByRole('tooltip')).toHaveTextContent(LOW_STOCK_TOOLTIP)

    await user.unhover(warningIcon())
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()

    await user.tab()
    expect(screen.getByRole('tooltip')).toHaveTextContent(LOW_STOCK_TOOLTIP)
  })

  it('does not show the indicator or the warning icon with normal stock', () => {
    render(<StockStatus totalQuantity={35} lowStock={false} />)

    expect(screen.getByText('En nivel')).toBeInTheDocument()
    expect(screen.queryByText('Bajo mínimo')).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Advertencia de stock bajo' }),
    ).not.toBeInTheDocument()
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
  })
})
