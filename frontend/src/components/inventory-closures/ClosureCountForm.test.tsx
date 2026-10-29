import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ApiError } from '../../services/http'
import { inventoryClosuresService } from '../../services/inventoryClosures.service'
import { buildClosure, buildItem } from '../../test-utils/inventoryClosures'
import type { InventoryClosure } from '../../types/inventoryClosure'

import { ClosureCountForm } from './ClosureCountForm'

vi.mock('../../services/inventoryClosures.service', () => ({
  inventoryClosuresService: { saveCounts: vi.fn(), confirm: vi.fn() },
}))

vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({ token: 'test-token' }),
}))

const saveCounts = vi.mocked(inventoryClosuresService.saveCounts)
const confirm = vi.mocked(inventoryClosuresService.confirm)

function renderForm(closure: InventoryClosure = buildClosure(), withConfirm = true) {
  const onSaved = vi.fn()
  const onConfirmed = vi.fn()
  const user = userEvent.setup()
  render(
    <ClosureCountForm
      closure={closure}
      onSaved={onSaved}
      onConfirmed={withConfirm ? onConfirmed : undefined}
    />,
  )
  return { user, onSaved, onConfirmed }
}

const quantity = (lot: string) =>
  screen.getByLabelText(`Cantidad contada de Whey Protein 2 lb, vence ${lot}`)

beforeEach(() => {
  vi.resetAllMocks()
  saveCounts.mockImplementation((_id, items) =>
    Promise.resolve(buildClosure({ countedItems: items.length })),
  )
  confirm.mockResolvedValue(buildClosure({ status: 'CONFIRMED', confirmed: true, locked: true }))
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

  it('marks the lots still missing when trying to confirm', async () => {
    const { user } = renderForm()

    await user.type(quantity('30 jun 2027'), '8')
    await user.click(screen.getByRole('button', { name: 'Confirmar cierre' }))

    expect(await screen.findByText('Falta contar este lote.')).toBeInTheDocument()
    expect(
      screen.getByText('Faltan 1 lote por contar. Escribe 0 si no encontraste unidades.'),
    ).toBeInTheDocument()
    expect(confirm).not.toHaveBeenCalled()
  })

  it('saves the pending counts and confirms after the warning', async () => {
    const { user, onConfirmed } = renderForm()

    await user.type(quantity('30 sept 2026'), '1')
    await user.type(quantity('30 jun 2027'), '8')
    await user.click(screen.getByRole('button', { name: 'Confirmar cierre' }))
    const dialog = within(screen.getByRole('dialog', { name: '¿Confirmar el cierre del día?' }))
    expect(dialog.getByText(/no se pueden cambiar las cantidades/)).toBeInTheDocument()
    await user.click(dialog.getByRole('button', { name: 'Sí, confirmar cierre' }))

    await waitFor(() => expect(onConfirmed).toHaveBeenCalled())
    expect(saveCounts).toHaveBeenCalledWith(
      'closure-1',
      [
        { productId: 'product-whey', expirationDate: '2026-09-30', physicalQuantity: 1 },
        { productId: 'product-whey', expirationDate: '2027-06-30', physicalQuantity: 8 },
      ],
      'test-token',
    )
    expect(confirm).toHaveBeenCalledWith('closure-1', 'test-token')
  })

  it('cancels the confirmation without saving or confirming', async () => {
    const { user } = renderForm()

    await user.type(quantity('30 sept 2026'), '1')
    await user.type(quantity('30 jun 2027'), '8')
    await user.click(screen.getByRole('button', { name: 'Confirmar cierre' }))
    const dialog = within(screen.getByRole('dialog', { name: '¿Confirmar el cierre del día?' }))
    await user.click(dialog.getByRole('button', { name: 'Seguir contando' }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(saveCounts).not.toHaveBeenCalled()
    expect(confirm).not.toHaveBeenCalled()
  })

  it('shows a processing state while the closure is being confirmed', async () => {
    let finishConfirm: (closure: InventoryClosure) => void = () => undefined
    confirm.mockImplementation(
      () =>
        new Promise<InventoryClosure>((resolve) => {
          finishConfirm = resolve
        }),
    )
    const { user, onConfirmed } = renderForm()

    await user.type(quantity('30 sept 2026'), '1')
    await user.type(quantity('30 jun 2027'), '8')
    await user.click(screen.getByRole('button', { name: 'Confirmar cierre' }))
    await user.click(screen.getByRole('button', { name: 'Sí, confirmar cierre' }))

    expect(await screen.findByRole('button', { name: 'Confirmando...' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Seguir contando' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Guardar conteo' })).toBeDisabled()
    expect(onConfirmed).not.toHaveBeenCalled()

    await act(async () => {
      finishConfirm(buildClosure({ status: 'CONFIRMED', confirmed: true, locked: true }))
    })

    await waitFor(() => expect(onConfirmed).toHaveBeenCalled())
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('lists the lots the api reports as missing', async () => {
    confirm.mockRejectedValue(
      new ApiError(
        'Incomplete',
        422,
        { pending: [{ productName: 'Creatina 300 g' }] },
        'INCOMPLETE_COUNT',
      ),
    )
    const { user } = renderForm()

    await user.type(quantity('30 sept 2026'), '1')
    await user.type(quantity('30 jun 2027'), '8')
    await user.click(screen.getByRole('button', { name: 'Confirmar cierre' }))
    await user.click(screen.getByRole('button', { name: 'Sí, confirmar cierre' }))

    expect(await screen.findByText('Faltan por contar: Creatina 300 g.')).toBeInTheDocument()
  })

  it('hides the confirmation when the page does not allow it', () => {
    renderForm(buildClosure(), false)

    expect(screen.queryByRole('button', { name: 'Confirmar cierre' })).not.toBeInTheDocument()
  })

  it('lets a branch without stock confirm an empty closure', async () => {
    const { user, onConfirmed } = renderForm(buildClosure({ items: [] }))

    expect(screen.getByText(/no hay nada que contar/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Confirmar cierre' }))
    await user.click(screen.getByRole('button', { name: 'Sí, confirmar cierre' }))

    await waitFor(() => expect(onConfirmed).toHaveBeenCalled())
  })
})
