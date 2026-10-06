import { expect, test, type Page } from '@playwright/test'

const MOCK_EMAIL = 'natalia.bernal@intelligent.co'
const NEW_PASSWORD = 'NuevaPass123!'

async function evidence(page: Page, name: string) {
  const dir = process.env.E2E_EVIDENCE_DIR
  if (!dir) return
  await page.screenshot({ path: `${dir}/${name}.png`, fullPage: true })
}

test('flujo completo de recuperación: solicitud, enlace, nueva contraseña y login', async ({
  page,
}) => {
  let forgotBody: { email?: string } | null = null
  let resetBody: { token?: string; password?: string } | null = null

  await page.route('**/auth/forgot-password*', async (route) => {
    forgotBody = route.request().postDataJSON()
    await route.fulfill({
      status: 200,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ message: 'ok' }),
    })
  })
  await page.route('**/auth/reset-password*', async (route) => {
    resetBody = route.request().postDataJSON()
    await route.fulfill({
      status: 200,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ message: 'ok' }),
    })
  })

  await page.goto('/login')
  await page.getByRole('link', { name: '¿La olvidaste?' }).click()
  await expect(page).toHaveURL(/\/forget-password/)

  await page.fill('#email', MOCK_EMAIL)
  await page.getByRole('button', { name: 'Enviar enlace' }).click()
  await expect(page.getByText('Si existe una cuenta con ese correo')).toBeVisible()
  expect(forgotBody?.email).toBe(MOCK_EMAIL)

  await page.goto('/reset-password?token=mock-e2e-token')
  await expect(page.getByRole('heading', { name: 'Crea una contraseña nueva' })).toBeVisible()

  await page.fill('#password', NEW_PASSWORD)
  await page.fill('#confirmPassword', NEW_PASSWORD)
  await page.getByRole('button', { name: 'Guardar contraseña' }).click()
  await expect(page.getByRole('heading', { name: 'Contraseña actualizada' })).toBeVisible()
  expect(resetBody?.token).toBe('mock-e2e-token')
  expect(resetBody?.password).toBe(NEW_PASSWORD)

  await evidence(page, '03-recuperacion-contrasena')

  await page.getByRole('button', { name: 'Ir a iniciar sesión' }).click()
  await expect(page).toHaveURL(/\/login/)
  await page.fill('#email', MOCK_EMAIL)
  await page.fill('#password', NEW_PASSWORD)
  await page.click('button[type="submit"]')
  await page.waitForURL('**/dashboard')
})

test('reset con token inválido muestra el mensaje de enlace no válido', async ({ page }) => {
  await page.route('**/auth/reset-password*', (route) =>
    route.fulfill({
      status: 400,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ error: { message: 'Token inválido o expirado' } }),
    }),
  )

  await page.goto('/reset-password?token=token-expirado')
  await page.fill('#password', NEW_PASSWORD)
  await page.fill('#confirmPassword', NEW_PASSWORD)
  await page.getByRole('button', { name: 'Guardar contraseña' }).click()

  await expect(page.getByRole('heading', { name: 'Enlace no válido' })).toBeVisible()
})
