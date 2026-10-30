import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { buildClosure, buildItem } from '../../test-utils/inventoryClosures'

import { ClosureResult } from './ClosureResult'

const confirmed = buildClosure({
  status: 'CONFIRMED',
  confirmed: true,
  locked: true,
  closedAt: '2026-10-27T01:30:00.000Z',
  totalDifferences: 2,
  items: [
    buildItem({
      expirationDate: '2026-09-30',
      systemQuantity: 2,
      physicalQuantity: 0,
      difference: -2,
      observation: 'Vencidos',
    }),
    buildItem({
      expirationDate: '2027-06-30',
      systemQuantity: 8,
      physicalQuantity: 9,
      difference: 1,
    }),
    buildItem({
      productName: 'Creatina',
      expirationDate: '2027-01-31',
      systemQuantity: 5,
      physicalQuantity: 5,
      difference: 0,
    }),
  ],
})

describe('ClosureResult', () => {
  it('shows the leader the differences with their sign and the totals', () => {
    render(<ClosureResult closure={confirmed} showDifferences />)

    expect(screen.getByText('Cierre del lunes, 26 de octubre confirmado')).toBeInTheDocument()
    expect(screen.getByText(/Se confirmó el 26 oct 2026, 8:30 p/)).toBeInTheDocument()
    const table = screen.getByRole('table', {
      name: 'Diferencias entre el sistema y el conteo físico',
    })
    expect(within(table).getByRole('columnheader', { name: 'Producto y lote' })).toBeInTheDocument()
    expect(within(table).getByRole('columnheader', { name: 'Sistema' })).toBeInTheDocument()
    expect(within(table).getByRole('columnheader', { name: 'Contado' })).toBeInTheDocument()
    expect(within(table).getByRole('columnheader', { name: 'Diferencia' })).toBeInTheDocument()
    expect(within(table).getByRole('columnheader', { name: 'Observación' })).toBeInTheDocument()
    const withDifference = screen.getByText('Con diferencia').parentElement as HTMLElement
    expect(within(withDifference).getByText('2')).toBeInTheDocument()
    const extra = screen.getByText('Unidades sobrantes').parentElement as HTMLElement
    expect(within(extra).getByText('1')).toBeInTheDocument()
    expect(screen.getByText('−2 und')).toBeInTheDocument()
    expect(screen.getByText('+1 und')).toBeInTheDocument()
    expect(screen.getByText('Sin diferencia')).toBeInTheDocument()
    expect(screen.getByText('Vencidos')).toBeInTheDocument()
  })

  it('shows the assistant the expected quantity but not the differences', () => {
    render(<ClosureResult closure={confirmed} showDifferences={false} />)

    expect(screen.getByRole('columnheader', { name: 'Esperado' })).toBeInTheDocument()
    expect(screen.getByText('8 und')).toBeInTheDocument()
    expect(screen.queryByText('−2 und')).not.toBeInTheDocument()
    expect(
      screen.getByText('El líder de la sede revisa las diferencias contra el sistema.'),
    ).toBeInTheDocument()
  })

  it('explains a closure locked by the nightly job', () => {
    render(
      <ClosureResult
        closure={buildClosure({
          status: 'NOT_CONFIRMED',
          locked: true,
          items: [buildItem({ systemQuantity: 4, physicalQuantity: null, difference: null })],
        })}
        showDifferences
      />,
    )

    expect(screen.getByText('Cierre del lunes, 26 de octubre sin confirmar')).toBeInTheDocument()
    expect(
      screen.getByText(
        'Nadie lo confirmó antes de la medianoche y el sistema lo bloqueó. Las diferencias se calcularon solo con los lotes que alcanzaron a contarse.',
      ),
    ).toBeInTheDocument()
    const counted = screen.getByText('Lotes contados').parentElement as HTMLElement
    expect(within(counted).getByText('0 de 1')).toBeInTheDocument()
    expect(screen.getByText('Sin contar')).toBeInTheDocument()
  })
})
