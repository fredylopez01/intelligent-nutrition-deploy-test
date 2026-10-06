import { expect, test } from '@playwright/test'

const SESSION_KEY = 'intelligent-nutrition:session'
const MOCK_EMAIL = 'natalia.bernal@intelligent.co'
const MOCK_PASSWORD = 'password123'

async function evidence(page: import('@playwright/test').Page, name: string) {
  const dir = process.env.E2E_EVIDENCE_DIR
  if (!dir) return
  await page.screenshot({ path: `${dir}/${name}.png`, fullPage: true })
}

test('login tradicional crea sesión activa que persiste tras recargar', async ({ page }) => {
  await page.goto('/login')
  await page.fill('#email', MOCK_EMAIL)
  await page.fill('#password', MOCK_PASSWORD)
  await page.click('button[type="submit"]')
  await page.waitForURL('**/dashboard')

  const raw = await page.evaluate((key) => localStorage.getItem(key), SESSION_KEY)
  expect(raw).toBeTruthy()
  const session = JSON.parse(raw!)
  expect(session.user.email).toBe(MOCK_EMAIL)
  expect(session.user.role.name).toBe('SUPERADMIN')
  expect(session.token).toBeTruthy()

  await evidence(page, '01-login-tradicional')

  await page.reload()
  await expect(page).toHaveURL(/\/dashboard/)
  await expect(page.locator('#email')).toHaveCount(0)
})

test('ruta protegida sin sesión redirige al login', async ({ page }) => {
  await page.goto('/usuarios')

  await expect(page).toHaveURL(/\/login/)
  await expect(page.getByRole('heading', { name: 'Ingresa a tu cuenta' })).toBeVisible()
})
