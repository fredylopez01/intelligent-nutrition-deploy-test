import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import type { Category } from '../../types/category'

import { CategoriesTable } from './CategoriesTable'

const proteins: Category = {
  id: 'cat-1',
  name: 'Proteínas',
  description: 'Suplementos de proteína',
  active: true,
}

const snacks: Category = {
  id: 'cat-2',
  name: 'Snacks',
  description: null,
  active: false,
}

function renderTable() {
  render(<CategoriesTable categories={[proteins, snacks]} />)
}

describe('CategoriesTable', () => {
  it('lists the name, description and state of each category', () => {
    renderTable()

    const rows = screen.getAllByRole('row').slice(1)
    expect(within(rows[0]).getByText('Proteínas')).toBeInTheDocument()
    expect(within(rows[0]).getByText('Suplementos de proteína')).toBeInTheDocument()
    expect(within(rows[0]).getByText('Activa')).toBeInTheDocument()
    expect(within(rows[1]).getByText('—')).toBeInTheDocument()
    expect(within(rows[1]).getByText('Inactiva')).toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })
})
