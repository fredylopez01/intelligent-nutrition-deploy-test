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

  it('is enabled and not busy when the list is idle', () => {
    render(<ReloadButton onReload={vi.fn()} loading={false} />)

    const button = screen.getByRole('button', { name: 'Recargar' })
    expect(button).toBeEnabled()
    expect(button).toHaveAttribute('aria-busy', 'false')
    expect(button).not.toHaveClass('ui-reload--loading')
  })

  it('marks the button with the loading style while the list loads', () => {
    render(<ReloadButton onReload={vi.fn()} loading />)

    expect(screen.getByRole('button')).toHaveClass('ui-reload', 'ui-reload--loading')
  })

  it('does not run the reload again while the list is loading', async () => {
    const onReload = vi.fn()
    const user = userEvent.setup()
    render(<ReloadButton onReload={onReload} loading />)

    await user.click(screen.getByRole('button', { name: 'Cargando...' }))

    expect(onReload).not.toHaveBeenCalled()
  })

  it('hides the icon from assistive technology', () => {
    const { container } = render(<ReloadButton onReload={vi.fn()} loading={false} />)

    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
  })

  it('does not submit the form it is placed in', async () => {
    const onSubmit = vi.fn((event: { preventDefault: () => void }) => event.preventDefault())
    const user = userEvent.setup()
    render(
      <form onSubmit={onSubmit}>
        <ReloadButton onReload={vi.fn()} loading={false} />
      </form>,
    )

    await user.click(screen.getByRole('button', { name: 'Recargar' }))

    expect(onSubmit).not.toHaveBeenCalled()
  })
})
