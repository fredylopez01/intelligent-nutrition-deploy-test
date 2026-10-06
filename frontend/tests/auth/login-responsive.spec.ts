import { test, expect, type Page } from '@playwright/test'

const DESKTOP = { width: 1440, height: 900 }
const MOBILE = { width: 375, height: 812 }

async function expectTwoColumns(page: Page) {
  const brand = await page.locator('.auth-layout__brand').boundingBox()
  const form = await page.locator('.auth-layout__form').boundingBox()
  expect(brand).not.toBeNull()
  expect(form).not.toBeNull()
  expect(form!.x).toBeGreaterThanOrEqual(brand!.x + brand!.width - 1)
}

async function expectSingleColumn(page: Page) {
  const brand = await page.locator('.auth-layout__brand').boundingBox()
  const form = await page.locator('.auth-layout__form').boundingBox()
  expect(brand).not.toBeNull()
  expect(form).not.toBeNull()
  expect(form!.y).toBeGreaterThanOrEqual(brand!.y + brand!.height - 1)
  expect(Math.abs(form!.x - brand!.x)).toBeLessThanOrEqual(1)
}

test.describe('TK-058-04 — Responsive del formulario de login', () => {
  test('escritorio (1440x900): dos columnas, isotipo visible y captura', async ({ page }) => {
    await page.setViewportSize(DESKTOP)
    await page.goto('/login')

    await expect(page.locator('.auth-layout__mark--top')).toBeVisible()
    await expectTwoColumns(page)

    await expect(page).toHaveScreenshot('login-desktop.png', {
      fullPage: true,
      maxDiffPixelRatio: 0.02,
    })
  })

  test('móvil (375x812): una columna, isotipo oculto y captura', async ({ page }) => {
    await page.setViewportSize(MOBILE)
    await page.goto('/login')

    await expect(page.locator('.auth-layout__mark--top')).toBeHidden()
    await expectSingleColumn(page)

    await expect(page).toHaveScreenshot('login-mobile.png', {
      fullPage: true,
      maxDiffPixelRatio: 0.02,
    })
  })

  for (const [width, columns] of [
    [861, 'two'],
    [860, 'one'],
  ] as const) {
    test(`breakpoint: ${width}px usa ${columns === 'two' ? 'dos' : 'una'} columnas`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 800 })
      await page.goto('/login')

      if (columns === 'two') {
        await expectTwoColumns(page)
      } else {
        await expectSingleColumn(page)
      }
    })
  }

  test('móvil: el formulario es usable y no produce scroll horizontal', async ({ page }) => {
    await page.setViewportSize(MOBILE)
    await page.goto('/login')

    await expect(page.locator('#email')).toBeVisible()
    await expect(page.locator('#password')).toBeVisible()
    await expect(page.locator('button[type="submit"]')).toBeVisible()

    const scroll = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      innerWidth: window.innerWidth,
    }))
    expect(scroll.scrollWidth).toBeLessThanOrEqual(scroll.innerWidth)
  })

  test('móvil: el flujo de login completo funciona a este ancho', async ({ page }) => {
    await page.setViewportSize(MOBILE)
    await page.goto('/login')

    await page.fill('#email', 'natalia.bernal@intelligent.co')
    await page.fill('#password', 'password123')
    await page.click('button[type="submit"]')
    await page.waitForURL((url) => url.pathname !== '/login')

    expect(page.url()).not.toContain('/login')
  })
})
