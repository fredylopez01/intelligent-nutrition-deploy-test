import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { AppRouter } from '../../routes/AppRouter'

import { PRIVACY_POLICY } from './privacyPolicy'
import { TERMS_OF_SERVICE } from './termsOfService'

vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({ login: vi.fn(), status: 'idle', user: null, token: null }),
}))

vi.mock('../../hooks/useBrandAssets', () => ({
  useBrandAssets: () => ({ logo: 'logo.png', isotipo: 'isotipo.png' }),
}))

const scrollTo = vi.fn()

function renderAt(path: string) {
  const user = userEvent.setup()
  const view = render(
    <MemoryRouter initialEntries={[path]}>
      <AppRouter />
    </MemoryRouter>,
  )
  return { user, ...view }
}

function tableOfContents() {
  return screen.getByRole('navigation', { name: 'En esta página' })
}

beforeEach(() => {
  vi.resetAllMocks()
  window.scrollTo = scrollTo as unknown as typeof window.scrollTo
  document.title = 'Intelligent Nutrition'
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe.each([
  ['/terminos', TERMS_OF_SERVICE],
  ['/privacidad', PRIVACY_POLICY],
])('legal page at %s', (path, content) => {
  it('opens without a session and shows the document heading and date', () => {
    renderAt(path)

    expect(screen.getByRole('heading', { level: 1, name: content.title })).toBeInTheDocument()
    expect(screen.getByText(content.summary)).toBeInTheDocument()
    expect(screen.getByText('10 de octubre de 2026')).toHaveAttribute('datetime', '2026-10-10')
  })

  it('lists every section in the index and links it to its heading', () => {
    renderAt(path)

    const links = within(tableOfContents()).getAllByRole('link')
    expect(links.map((link) => link.textContent?.slice(2))).toEqual(
      content.sections.map((section) => section.title),
    )
    content.sections.forEach((section, index) => {
      expect(links[index]).toHaveAttribute('href', `#${section.id}`)
      const region = screen.getByRole('region', { name: section.title })
      expect(region).toHaveAttribute('id', section.id)
    })
  })

  it('names the browser tab after the document, starts at the top and restores the title', () => {
    const { unmount } = renderAt(path)

    expect(document.title).toBe(`${content.title} | Intelligent Nutrition`)
    expect(scrollTo).toHaveBeenCalledWith({ top: 0, behavior: 'instant' })

    unmount()
    expect(document.title).toBe('Intelligent Nutrition')
  })

  it('offers the contact email as a mail link', () => {
    renderAt(path)

    const contact = screen.getByRole('complementary', { name: 'Contacto' })
    expect(
      within(contact).getByRole('link', { name: 'intelligentnutrition.shop@gmail.com' }),
    ).toHaveAttribute('href', 'mailto:intelligentnutrition.shop@gmail.com')
  })
})

describe('legal pages navigation', () => {
  it('marks the open document in the header', () => {
    renderAt('/privacidad')

    const header = screen.getByRole('navigation', { name: 'Documentos legales' })
    expect(within(header).getByRole('link', { name: 'Privacidad' })).toHaveAttribute(
      'aria-current',
      'page',
    )
    expect(within(header).getByRole('link', { name: 'Términos' })).not.toHaveAttribute(
      'aria-current',
    )
  })

  it('moves from the terms to the privacy policy and back', async () => {
    const { user } = renderAt('/terminos')

    await user.click(screen.getByRole('link', { name: 'Lee la Política de privacidad →' }))
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Política de privacidad' }),
    ).toBeInTheDocument()

    await user.click(screen.getByRole('link', { name: 'Lee los Términos del servicio →' }))
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Términos del servicio' }),
    ).toBeInTheDocument()
  })

  it('goes back to the landing page', async () => {
    const { user } = renderAt('/privacidad')

    await user.click(screen.getByRole('link', { name: '← Volver al inicio' }))

    expect(
      await screen.findByRole('heading', { level: 1, name: /Suplementación/ }),
    ).toBeInTheDocument()
  })

  it.each([
    ['Términos', 'Términos del servicio'],
    ['Política de privacidad', 'Política de privacidad'],
  ])('opens from the login legal note (%s)', async (linkName, title) => {
    const { user } = renderAt('/login')

    await user.click(screen.getByRole('link', { name: linkName }))

    expect(await screen.findByRole('heading', { level: 1, name: title })).toBeInTheDocument()
  })

  it.each([
    ['Términos', 'Términos del servicio'],
    ['Privacidad', 'Política de privacidad'],
  ])('opens from the landing footer (%s)', async (linkName, title) => {
    const { user } = renderAt('/')

    const footer = screen.getByRole('contentinfo')
    await user.click(within(footer).getByRole('link', { name: linkName }))

    expect(await screen.findByRole('heading', { level: 1, name: title })).toBeInTheDocument()
  })
})

describe('legal page index highlight', () => {
  let sectionTops: Record<string, number>

  beforeEach(() => {
    sectionTops = {}
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: Element,
    ) {
      return { top: sectionTops[this.id] ?? 0 } as DOMRect
    })
    Object.defineProperty(document.documentElement, 'scrollHeight', {
      configurable: true,
      value: 20000,
    })
  })

  afterEach(() => {
    Reflect.deleteProperty(document.documentElement, 'scrollHeight')
  })

  function placeSections(firstTop: number) {
    TERMS_OF_SERVICE.sections.forEach((section, index) => {
      sectionTops[section.id] = firstTop + index * 600
    })
  }

  function currentLink() {
    return within(tableOfContents())
      .getAllByRole('link')
      .filter((link) => link.getAttribute('aria-current') === 'location')
  }

  it('leaves the index unmarked before the first section is reached', async () => {
    placeSections(900)
    renderAt('/terminos')

    await new Promise((resolve) => window.requestAnimationFrame(resolve))
    expect(currentLink()).toHaveLength(0)
  })

  it('highlights the section being read and follows the scroll', async () => {
    placeSections(-500)
    renderAt('/terminos')

    await waitFor(() =>
      expect(currentLink().map((link) => link.textContent)).toEqual([
        '02Uso del sitio y de las cuentas',
      ]),
    )

    placeSections(-1100)
    fireEvent.scroll(window)

    await waitFor(() =>
      expect(currentLink().map((link) => link.textContent)).toEqual(['03Condiciones generales']),
    )
  })

  it('highlights the last section once the page reaches the bottom', async () => {
    placeSections(-500)
    Object.defineProperty(document.documentElement, 'scrollHeight', {
      configurable: true,
      value: window.innerHeight,
    })
    renderAt('/terminos')

    await waitFor(() =>
      expect(currentLink().map((link) => link.textContent)).toEqual(['16Contacto']),
    )
  })
})
