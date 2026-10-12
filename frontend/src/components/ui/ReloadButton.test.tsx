import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { ReloadButton } from './ReloadButton'

describe('ReloadButton', () => {
  it('runs the reload when pressed', async () => {
    const onReload = vi.fn()
    const user = userEvent.setup()
    render(<ReloadButton onReload={onReload} loading={false} />)

    await user.click(screen.getByRole('button', { name: 'Recargar' }))

    expect(onReload).toHaveBeenCalledTimes(1)
  })

  it('is disabled and shows the loading indicator while the list loads', () => {
    render(<ReloadButton onReload={vi.fn()} loading />)

    const button = screen.getByRole('button', { name: 'Cargando...' })
    expect(button).toBeDisabled()
    expect(button).toHaveAttribute('aria-busy', 'true')
  })
})
