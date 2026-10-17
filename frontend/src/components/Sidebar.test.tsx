import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { Sidebar } from './Sidebar'

const auth = vi.hoisted(() => ({ role: 'SUPERADMIN' }))

vi.mock('../hooks/useAuth', () => ({
  useAuth: () => ({
    user: { id: 'me', fullName: 'Persona Prueba', role: { name: auth.role } },
    logout: vi.fn(),
  }),
}))

vi.mock('../hooks/useTheme', () => ({
  useTheme: () => ({ preference: 'system', theme: 'light', setPreference: vi.fn() }),
}))

vi.mock('../hooks/useBrandAssets', () => ({
  useBrandAssets: () => ({ logo: 'logo.png', isotipo: 'isotipo.png' }),
}))

function menuLabels() {
  const nav = screen.getByRole('navigation', { name: 'Navegación principal' })
  return within(nav)
    .getAllByRole('link')
    .map((link) => link.textContent)
}

function renderSidebar(path = '/dashboard') {
  render(
    <MemoryRouter initialEntries={[path]}>
      <Sidebar />
    </MemoryRouter>,
  )
}

const ALWAYS = ['Dashboard', 'Inventario', 'Catálogo', 'POS', 'Reportes']

beforeEach(() => {
  auth.role = 'SUPERADMIN'
})

describe('Sidebar menu by role', () => {
  it('shows every module to the superadmin', () => {
    renderSidebar()

    expect(menuLabels()).toEqual([
      'Dashboard',
      'Sedes',
      'Inventario',
      'Catálogo',
      'POS',
      'Clientes',
      'Proveedores',
      'Usuarios',
      'Reportes',
      'Auditoría',
    ])
  })

  it('hides branches, users and audit from the branch leader', () => {
    auth.role = 'BRANCH_LEADER'
    renderSidebar()

    const labels = menuLabels()
    expect(labels).toEqual(expect.arrayContaining([...ALWAYS, 'Clientes', 'Proveedores']))
    expect(labels).not.toContain('Sedes')
    expect(labels).not.toContain('Usuarios')
    expect(labels).not.toContain('Auditoría')
  })

  it('only shows customers among the restricted modules to the branch assistant', () => {
    auth.role = 'BRANCH_ASSISTANT'
    renderSidebar()

    const labels = menuLabels()
    expect(labels).toEqual(expect.arrayContaining([...ALWAYS, 'Clientes']))
    for (const hidden of ['Sedes', 'Proveedores', 'Usuarios', 'Auditoría']) {
      expect(labels).not.toContain(hidden)
    }
  })

  it('shows users and audit but not the branch modules, the inventory nor the catalog to DEV', () => {
    auth.role = 'DEV'
    renderSidebar()

    const labels = menuLabels()
    expect(labels).toEqual(
      expect.arrayContaining(['Dashboard', 'POS', 'Reportes', 'Usuarios', 'Auditoría']),
    )
    for (const hidden of ['Sedes', 'Inventario', 'Catálogo', 'Clientes', 'Proveedores']) {
      expect(labels).not.toContain(hidden)
    }
  })

  it('does not render disabled entries for hidden modules', () => {
    auth.role = 'BRANCH_ASSISTANT'
    renderSidebar()

    expect(screen.queryByText('Sedes')).not.toBeInTheDocument()
    expect(screen.queryByText('Usuarios')).not.toBeInTheDocument()
  })
})

describe('Sidebar catalog submenu', () => {
  function catalogSubs() {
    const nav = screen.getByRole('navigation', { name: 'Navegación principal' })
    return within(nav)
      .getAllByRole('link')
      .filter((link) => link.getAttribute('href')?.startsWith('/catalogo'))
      .map((link) => link.textContent)
  }

  it('shows products, categories and units inside the catalog', () => {
    renderSidebar('/catalogo/categorias')

    expect(catalogSubs()).toEqual(['Catálogo', 'Productos', 'Categorías', 'Unidades de medida'])
  })

  it.each(['BRANCH_LEADER', 'BRANCH_ASSISTANT'])('shows the catalog submenu to the %s', (role) => {
    auth.role = role
    renderSidebar('/catalogo')

    expect(catalogSubs()).toEqual(['Catálogo', 'Productos', 'Categorías', 'Unidades de medida'])
  })

  it('hides the whole catalog from DEV, as the contract does not include it', () => {
    auth.role = 'DEV'
    renderSidebar('/dashboard')

    expect(catalogSubs()).toEqual([])
  })
})

describe('Sidebar inventory submenu', () => {
  function inventorySubs() {
    const nav = screen.getByRole('navigation', { name: 'Navegación principal' })
    return within(nav)
      .getAllByRole('link')
      .filter((link) => link.getAttribute('href')?.startsWith('/inventario'))
      .map((link) => link.textContent)
  }

  it('shows the consolidated inventory only to the superadmin', () => {
    renderSidebar('/inventario')

    expect(inventorySubs()).toEqual([
      'Inventario',
      'Existencias',
      'Consolidado',
      'Movimientos',
      'Cierre diario',
    ])
  })

  it.each(['BRANCH_LEADER', 'BRANCH_ASSISTANT'])(
    'hides the consolidated inventory from the %s',
    (role) => {
      auth.role = role
      renderSidebar('/inventario')

      expect(inventorySubs()).not.toContain('Consolidado')
      expect(inventorySubs()).toContain('Existencias')
    },
  )
})
