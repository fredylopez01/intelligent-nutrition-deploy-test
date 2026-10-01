import { test, expect } from '@playwright/test'

test.describe('TK-031.3 — Actualización de usuarios', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login')
    await page.fill('#email', 'natalia.bernal@intelligent.co')
    await page.fill('#password', 'password123')
    await page.click('button[type="submit"]')
    await page.waitForURL((url) => url.pathname !== '/login')
    await page.goto('/usuarios')
    await page.waitForSelector('table tbody tr')
  })

  test('Muestra panel de detalle al seleccionar un usuario', async ({ page }) => {
    await page.locator('table tbody tr .users-table__selector').first().click()

    await expect(page.locator('.user-detail__name')).toBeVisible()
    await expect(page.locator('#edit-user-fullName')).toBeVisible()
    await expect(page.locator('#edit-user-email')).toBeVisible()
    await expect(page.locator('button:has-text("Guardar cambios")')).toBeVisible()
  })

  test('Muestra error si el nombre tiene menos de 2 caracteres', async ({ page }) => {
    await page.locator('table tbody tr .users-table__selector').first().click()
    await page.fill('#edit-user-fullName', 'A')
    await page.click('button:has-text("Guardar cambios")')

    await expect(page.locator('text=El nombre debe tener al menos 2 caracteres')).toBeVisible()
  })

  test('Muestra error si el correo es inválido', async ({ page }) => {
    await page.locator('table tbody tr .users-table__selector').first().click()
    await page.fill('#edit-user-email', 'no-es-email')
    await page.click('button:has-text("Guardar cambios")')

    await expect(page.locator('text=Ingresa un correo válido')).toBeVisible()
  })

  test('Muestra "No hay cambios" si se envía sin modificar', async ({ page }) => {
    await page.locator('table tbody tr .users-table__selector').first().click()
    await page.click('button:has-text("Guardar cambios")')

    await expect(page.locator('text=No hay cambios por guardar')).toBeVisible()
  })

  test('Actualiza nombre y email exitosamente', async ({ page }) => {
    await page.locator('table tbody tr .users-table__selector').first().click()
    await page.fill('#edit-user-fullName', 'Fabian Correa Updated')
    await page.fill('#edit-user-email', 'fabian.updated@test.com')
    await page.click('button:has-text("Guardar cambios")')

    await expect(page.locator('text=Los cambios se guardaron correctamente')).toBeVisible()
  })

  test('Cambia el rol de un usuario', async ({ page }) => {
    await page.locator('table tbody tr .users-table__selector').first().click()
    await page.locator('.user-detail__role').nth(1).click()
    await page.click('button:has-text("Guardar cambios")')

    await expect(page.locator('text=Los cambios se guardaron correctamente')).toBeVisible()
  })

  test('Botón Guardar muestra estado de carga', async ({ page }) => {
    await page.locator('table tbody tr .users-table__selector').first().click()
    await page.fill('#edit-user-fullName', 'Test User Loading')
    await page.click('button:has-text("Guardar cambios")')

    await expect(page.locator('button:has-text("Guardando...")')).toBeVisible()
  })

  test('Botón Desactivar está habilitado y abre el modal de confirmación', async ({ page }) => {
    await page.locator('table tbody tr .users-table__selector').first().click()
    const deactivate = page.locator('button:has-text("Desactivar usuario")')
    await expect(deactivate).toBeEnabled()
    await deactivate.click()
    await expect(page.locator('text=¿Desactivar esta cuenta?')).toBeVisible()
    await page.click('button:has-text("Cancelar")')
    await expect(page.locator('text=¿Desactivar esta cuenta?')).toBeHidden()
  })

  test('Redirige a login si no hay sesión', async ({ page }) => {
    await page.context().clearCookies()
    await page.evaluate(() => localStorage.clear())
    await page.goto('/usuarios')

    await expect(page).toHaveURL(/\/login/)
  })
})
