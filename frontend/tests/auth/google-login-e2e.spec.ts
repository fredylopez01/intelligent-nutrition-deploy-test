import { expect, test } from '@playwright/test'

const SESSION_KEY = 'intelligent-nutrition:session'

const ME_USER = {
  id: 'e2e-google-user',
  fullName: 'Natalia Bernal',
  email: 'natalia.bernal@intelligent.co',
  roleId: 'e2e-role-superadmin',
  active: true,
  role: { name: 'SUPERADMIN' },
}

async function evidence(page: import('@playwright/test').Page, name: string) {
  const dir = process.env.E2E_EVIDENCE_DIR
  if (!dir) return
  await page.screenshot({ path: `${dir}/${name}.png`, fullPage: true })
}

test('login con Google completa el OAuth simulado y crea sesión', async ({ page }) => {
  await page.goto('/login')
  const appOrigin = new URL(page.url()).origin

  await page.route('**/auth/google*', (route) =>
    route.fulfill({
      status: 302,
      headers: {
        location: `${appOrigin}/auth/google/callback#accessToken=dev-e2e-token`,
      },
    }),
  )
  await page.route('**/auth/me*', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 800))
    await route.fulfill({
      status: 200,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(ME_USER),
    })
  })

  await page.getByRole('button', { name: 'Continuar con Google' }).click()
  await page.waitForURL('**/auth/google/callback**')
  await expect(page.getByRole('status')).toHaveText('Finalizando el inicio de sesión...')

  await evidence(page, '02-login-google')

  await page.waitForURL('**/dashboard')

  const raw = await page.evaluate((key) => localStorage.getItem(key), SESSION_KEY)
  expect(raw).toBeTruthy()
  const session = JSON.parse(raw!)
  expect(session.token).toBe('dev-e2e-token')
  expect(session.user.email).toBe(ME_USER.email)
  expect(session.user.role.name).toBe('SUPERADMIN')
})

test('callback de Google sin accessToken muestra el error en el login', async ({ page }) => {
  await page.goto('/login')
  const appOrigin = new URL(page.url()).origin

  await page.route('**/auth/google*', (route) =>
    route.fulfill({
      status: 302,
      headers: { location: `${appOrigin}/auth/google/callback` },
    }),
  )

  await page.getByRole('button', { name: 'Continuar con Google' }).click()

  await expect(page).toHaveURL(/\/login\?authError=GOOGLE_AUTH_FAILED/)
  await expect(
    page.getByRole('alert').filter({ hasText: 'No fue posible iniciar sesión con Google' }),
  ).toBeVisible()
})
