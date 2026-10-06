import { expect, test, type Page } from '@playwright/test'

const SESSION_KEY = 'intelligent-nutrition:session'
const MOCK_EMAIL = 'natalia.bernal@intelligent.co'
const MOCK_PASSWORD = 'password123'

interface MockBranch {
  id: string
  name: string
  address: string
  phone: string
  active: boolean
}

const runId = Date.now().toString(36)
const branchName = `Sede E2E ${runId}`
const controlName = 'Sede Centro Control'

async function evidence(page: Page, name: string) {
  const dir = process.env.E2E_EVIDENCE_DIR
  if (!dir) return
  await page.screenshot({ path: `${dir}/${name}.png`, fullPage: true })
}

async function loginAsSuperadmin(page: Page) {
  await page.goto('/login')
  await page.fill('#email', MOCK_EMAIL)
  await page.fill('#password', MOCK_PASSWORD)
  await page.click('button[type="submit"]')
  await page.waitForURL('**/dashboard')
  const raw = await page.evaluate((key) => localStorage.getItem(key), SESSION_KEY)
  expect(JSON.parse(raw!).user.role.name).toBe('SUPERADMIN')
}

async function installBranchesApi(page: Page) {
  const branches: MockBranch[] = [
    {
      id: 'branch-control',
      name: controlName,
      address: 'Avenida Principal 10-20',
      phone: '6010000000',
      active: true,
    },
  ]

  await page.route(/\/api\/v1\/branches/, async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    const method = request.method()
    const respond = (body: unknown, status = 200) =>
      route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })

    if (method === 'GET') {
      // Devuelve todas las sedes (incluidas inactivas) aunque la petición traiga
      // active=true: así la aserción final ejercita el doble filtro (servidor + cliente).
      return respond({
        data: branches,
        meta: { page: 1, limit: 100, total: branches.length, totalPages: 1 },
      })
    }

    const segments = url.pathname.split('/').filter(Boolean) // ['api', 'v1', 'branches', ...]
    const rest = segments.slice(3)
    const id = rest[0]
    const isStatusPatch = rest[1] === 'status'

    if (method === 'POST') {
      const payload = request.postDataJSON() as { name: string; address: string; phone: string }
      const created: MockBranch = { id: `branch-${runId}`, active: true, ...payload }
      branches.push(created)
      return respond({ data: created }, 201)
    }

    if (method === 'PATCH') {
      const target = branches.find((branch) => branch.id === id)
      if (!target) return respond({ error: { message: 'Sede no encontrada.' } }, 404)
      const payload = request.postDataJSON() as Record<string, unknown>
      if (isStatusPatch) {
        target.active = payload.active === true
      } else {
        Object.assign(target, payload)
      }
      return respond({ data: target })
    }

    return respond({ error: { message: 'Método no soportado.' } }, 405)
  })
}

test('CRUD de sede: crear, editar, desactivar y ocultarla del selector de asociación', async ({
  page,
}) => {
  test.setTimeout(60_000)
  await installBranchesApi(page)

  await test.step('login como Superadmin', async () => {
    await loginAsSuperadmin(page)
    await evidence(page, '01-login')
  })

  await test.step('crear sede y verla en el listado', async () => {
    await page.goto('/sedes')
    await page
      .locator('.branches-page__toolbar')
      .getByRole('button', { name: 'Registrar sede' })
      .click()

    const createDialog = page.getByRole('dialog')
    await expect(createDialog.getByRole('heading', { name: 'Registrar sede' })).toBeVisible()
    await createDialog.locator('#create-branch-name').fill(branchName)
    await createDialog.locator('#create-branch-address').fill('Carrera 12 # 34-56')
    await createDialog.locator('#create-branch-phone').fill('6015556677')
    await createDialog.getByRole('button', { name: 'Registrar sede' }).click()

    await expect(page.getByText('Sede creada exitosamente.')).toBeVisible()
    const row = page.getByRole('row').filter({ hasText: branchName })
    await expect(row).toBeVisible()
    await expect(row).toContainText('Carrera 12 # 34-56')
    await expect(row.locator('.ui-status')).toHaveText('Activo')
    await evidence(page, '02-sede-creada')
  })

  await test.step('editar la sede', async () => {
    await page.getByRole('button', { name: `Acciones para ${branchName}` }).click()
    await page.getByRole('menuitem', { name: 'Editar' }).click()

    const editDialog = page.getByRole('dialog')
    await expect(editDialog.getByRole('heading', { name: 'Editar sede' })).toBeVisible()
    await editDialog.locator('#edit-branch-address').fill('Avenida Siempreviva 742')
    await editDialog.getByRole('button', { name: 'Guardar cambios' }).click()

    await expect(page.getByText('Los cambios se guardaron correctamente.')).toBeVisible()
    const row = page.getByRole('row').filter({ hasText: branchName })
    await expect(row).toContainText('Avenida Siempreviva 742')
    await evidence(page, '03-sede-editada')
  })

  await test.step('desactivar la sede', async () => {
    await page.getByRole('button', { name: `Acciones para ${branchName}` }).click()
    await page.getByRole('menuitem', { name: 'Desactivar' }).click()

    const confirmDialog = page.getByRole('dialog')
    await expect(
      confirmDialog.getByRole('heading', { name: '¿Desactivar esta sede?' }),
    ).toBeVisible()
    await confirmDialog.getByRole('button', { name: 'Sí, desactivar' }).click()

    await expect(page.getByText(`La sede ${branchName} ahora está inactiva.`)).toBeVisible()
    const row = page.getByRole('row').filter({ hasText: branchName })
    await expect(row.locator('.ui-status')).toHaveText('Inactivo')
    await evidence(page, '04-sede-desactivada')
  })

  await test.step('la sede desactivada no aparece al asociar un usuario', async () => {
    await page.goto('/usuarios')
    await page.getByRole('button', { name: 'Asociar a sede' }).click()

    const assignDialog = page.getByRole('dialog')
    await expect(
      assignDialog.getByRole('heading', { name: 'Asociar usuario a sede' }),
    ).toBeVisible()

    const userSelect = assignDialog.locator('#assign-user-id')
    await expect(userSelect.locator('option', { hasText: 'Natalia Bernal' })).toHaveCount(1)
    await userSelect.selectOption('u-2')

    const branchSelect = assignDialog.locator('#assign-branch-id')
    await expect(branchSelect).toBeEnabled()
    // El control activo sí debe estar disponible (prueba de que el select cargó).
    await expect(branchSelect.locator('option', { hasText: controlName })).toHaveCount(1)
    // La sede recién desactivada no debe ofrecerse como opción.
    await expect(branchSelect.locator('option', { hasText: branchName })).toHaveCount(0)
    await expect(assignDialog.getByText('Solo se muestran sedes activas.')).toBeVisible()
    await evidence(page, '05-selector-sin-sede-inactiva')
  })
})
