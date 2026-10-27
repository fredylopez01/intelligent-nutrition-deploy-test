import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { inventoryClosuresService } from '../../services/inventoryClosures.service'
import { buildClosure, buildItem } from '../../test-utils/inventoryClosures'
import type { InventoryClosure } from '../../types/inventoryClosure'

import { ClosureCountForm } from './ClosureCountForm'

vi.mock('../../services/inventoryClosures.service', () => ({
  inventoryClosuresService: { saveCounts: vi.fn() },
}))

vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({ token: 'test-token' }),
}))

const saveCounts = vi.mocked(inventoryClosuresService.saveCounts)

function renderForm(closure: InventoryClosure = buildClosure()) {
  const onSaved = vi.fn()
  const user = userEvent.setup()
  render(<ClosureCountForm closure={closure} onSaved={onSaved} />)
  return { user, onSaved }
}

const quantity = (lot: string) =>
  screen.getByLabelText(`Cantidad contada de Whey Protein 2 lb, vence ${lot}`)

beforeEach(() => {
  vi.resetAllMocks()
  saveCounts.mockImplementation((_id, items) =>
    Promise.resolve(buildClosure({ countedItems: items.length })),
  )
})

describe('ClosureCountForm', () => {
  it('never shows the system quantity while counting', () => {
    renderForm()

    expect(screen.getByRole('table', { name: 'Lotes a contar' })).toBeInTheDocument()
    expect(screen.queryByText(/Sistema/)).not.toBeInTheDocument()
    expect(screen.getByText('Vencido')).toBeInTheDocument()
  })

  it('saves only the lots that were counted, with their observation', async () => {
    const { user, onSaved } = renderForm()

    await user.type(quantity('31 dic 2028'.replace('31 dic 2028', '30 jun 2027')), '7')
    await user.type(
      screen.getByLabelText('Observación de Whey Protein 2 lb, vence 30 jun 2027'),
      ' Un tarro abierto ',
    )
    await user.click(screen.getByRole('button', { name: 'Guardar conteo' }))

    await waitFor(() =>
      expect(saveCounts).toHaveBeenCalledWith(
        'closure-1',
        [
          {
            productId: 'product-whey',
            expirationDate: '2027-06-30',
            physicalQuantity: 7,
            observation: 'Un tarro abierto',
          },
        ],
        'test-token',
      ),
    )
    expect(onSaved).toHaveBeenCalled()
    expect(
      await screen.findByText('Conteo guardado. Llevas 1 de 2 lotes contados.'),
    ).toBeInTheDocument()
  })

  it('accepts zero as a count and rejects decimals', async () => {
    const { user } = renderForm()

    await user.type(quantity('30 sept 2026'), '0')
    await user.type(quantity('30 jun 2027'), '1.5')
    await user.click(screen.getByRole('button', { name: 'Guardar conteo' }))

    expect(
      await screen.findByText('Escribe un número entero de 0 en adelante, sin puntos ni comas.'),
    ).toBeInTheDocument()
    expect(saveCounts).not.toHaveBeenCalled()
  })

  it('does not call the api when nothing changed', async () => {
    const { user } = renderForm()

    await user.click(screen.getByRole('button', { name: 'Guardar conteo' }))

    expect(await screen.findByText('No hay cambios por guardar.')).toBeInTheDocument()
  })

  it('shows the progress of the count', async () => {
    const { user } = renderForm(
      buildClosure({
        items: [
          buildItem({ expirationDate: '2026-09-30', physicalQuantity: 2 }),
          buildItem({ expirationDate: '2027-06-30' }),
        ],
      }),
    )

    expect(screen.getByRole('progressbar', { name: 'Avance del conteo' })).toHaveAttribute(
      'aria-valuenow',
      '50',
    )
    await user.type(quantity('30 jun 2027'), '8')
    expect(screen.getByText(/cambios sin guardar/)).toBeInTheDocument()
  })
})
