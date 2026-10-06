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

interface MockAuditActor {
  id: string
  firstName: string
  lastName: string
  email: string
}

interface MockAuditLog {
  id: string
  userId: string
  action: string
  entity: string
  entityId: string
  oldData: Record<string, unknown> | null
  newData: Record<string, unknown> | null
  reason: string
  ipAddress: string | null
  createdAt: string
  userAccount: { person: MockAuditActor } | null
}

const runId = Date.now().toString(36)
const branchId = 'branch-control'
const branchName = 'Sede Centro Control'
const secondaryBranchId = 'branch-norte'
const secondaryBranchName = 'Sede Norte'
const targetUserId = 'u-3'
const assignReason = `Asignación de la sede ${branchName} al usuario ${targetUserId}`
const unassignReason = `Desasignación de la sede ${branchName} del usuario ${targetUserId}`

const actor: MockAuditActor = {
  id: 'u-1',
  firstName: 'Natalia',
  lastName: 'Bernal',
  email: MOCK_EMAIL,
}

let auditLogSeq = 0

function buildAuditLog(entry: {
  action: string
  reason: string
  oldData?: Record<string, unknown>
  newData?: Record<string, unknown>
}): MockAuditLog {
  auditLogSeq += 1
  return {
    id: `log-${auditLogSeq}-${runId}`,
    userId: actor.id,
    action: entry.action,
    entity: 'USER',
    entityId: targetUserId,
    oldData: entry.oldData ?? null,
    newData: entry.newData ?? null,
    reason: entry.reason,
    ipAddress: '127.0.0.1',
    createdAt: new Date().toISOString(),
    userAccount: { person: actor },
  }
}

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
      id: branchId,
      name: branchName,
      address: 'Avenida Principal 10-20',
      phone: '6010000000',
      active: true,
    },
    {
      id: secondaryBranchId,
      name: secondaryBranchName,
      address: 'Calle 5 # 12-34',
      phone: '6010000001',
      active: true,
    },
  ]

  await page.route(/\/api\/v1\/branches/, async (route) => {
    const request = route.request()
    if (request.method() === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: branches,
          meta: { page: 1, limit: 100, total: branches.length, totalPages: 1 },
        }),
      })
    }
    return route.fulfill({
      status: 405,
      contentType: 'application/json',
      body: JSON.stringify({ error: { message: 'Método no soportado.' } }),
    })
  })
}

async function installAuditLogsApi(page: Page): Promise<MockAuditLog[]> {
  const logs: MockAuditLog[] = []
  await page.route(/\/api\/v1\/audit-logs/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: logs,
        meta: { page: 1, limit: 10, total: logs.length, totalPages: 1 },
      }),
    })
  })
  return logs
}

async function openAssignDialog(page: Page) {
  await page.goto('/usuarios')
  await page.getByRole('button', { name: 'Asociar a sede' }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByRole('heading', { name: 'Asociar usuario a sede' })).toBeVisible()
  return dialog
}

test('Asociar usuario a sede y verificar los logs de auditoría', async ({ page }) => {
  test.setTimeout(60_000)
  const logs = await installAuditLogsApi(page)
  await installBranchesApi(page)

  await test.step('login como Superadmin', async () => {
    await loginAsSuperadmin(page)
    await evidence(page, '01-login')
  })

  await test.step('asociar un usuario a una sede activa', async () => {
    const dialog = await openAssignDialog(page)
    await dialog.locator('#assign-user-id').selectOption(targetUserId)
    const branchSelect = dialog.locator('#assign-branch-id')
    await expect(branchSelect).toBeEnabled()
    await branchSelect.selectOption(branchId)

    await dialog.getByRole('button', { name: 'Asociar a sede' }).click()
    await expect(page.getByText('Usuario asociado a la sede correctamente')).toBeVisible()
    await evidence(page, '02-usuario-asociado')
  })

  await test.step('verificar la asociación en el listado', async () => {
    const dialog = page.getByRole('dialog')
    const assignments = dialog.locator('.assign-branch__assignments')
    await expect(assignments.getByText(branchName)).toBeVisible()
    await expect(assignments.getByRole('button', { name: 'Desactivar' })).toBeVisible()

    const branchSelect = dialog.locator('#assign-branch-id')
    await expect(branchSelect.locator('option', { hasText: branchName })).toHaveCount(0)
    await expect(branchSelect.locator('option', { hasText: secondaryBranchName })).toHaveCount(1)
    await evidence(page, '03-asociacion-en-listado')
  })

  await test.step('el log de auditoría registra la asignación', async () => {
    logs.unshift(
      buildAuditLog({
        action: 'ASSIGN',
        reason: assignReason,
        newData: {
          branchId,
          branchName,
          assignmentId: `mock-assignment-${runId}`,
          assignmentDate: new Date().toISOString().slice(0, 10),
        },
      }),
    )

    await page.goto('/auditoria')
    const row = page.getByRole('row').filter({ hasText: assignReason })
    await expect(row).toBeVisible()
    await expect(row).toContainText('Asignación')
    await expect(row).toContainText('Usuario')
    await expect(row).toContainText('Natalia Bernal')

    await row.getByRole('button', { name: 'Ver detalle' }).click()
    const detailDialog = page.getByRole('dialog')
    await expect(detailDialog.getByRole('heading', { name: 'Detalle del cambio' })).toBeVisible()
    await expect(detailDialog.getByText(assignReason)).toBeVisible()
    await expect(detailDialog.locator('.audit-detail__json').nth(1)).toContainText(branchName)
    await expect(detailDialog.locator('.audit-detail__json').nth(1)).toContainText(branchId)
    await evidence(page, '04-detalle-log-asignacion')

    await page.keyboard.press('Escape')
    await expect(detailDialog).toBeHidden()
  })

  await test.step('desactivar la asignación', async () => {
    const dialog = await openAssignDialog(page)
    await dialog.locator('#assign-user-id').selectOption(targetUserId)

    const assignments = dialog.locator('.assign-branch__assignments')
    await expect(assignments.getByText(branchName)).toBeVisible()
    await assignments.getByRole('button', { name: 'Desactivar' }).click()

    await expect(page.getByText('La asignación quedó desactivada.')).toBeVisible()
    await expect(assignments.getByText(branchName)).toHaveCount(0)
    await expect(
      assignments.getByText('Este usuario no tiene sedes activas asociadas.'),
    ).toBeVisible()
    await evidence(page, '05-asignacion-desactivada')
  })

  await test.step('el log de auditoría registra la desasignación', async () => {
    logs.unshift(
      buildAuditLog({
        action: 'UNASSIGN',
        reason: unassignReason,
        oldData: {
          branchId,
          branchName,
          assignmentDate: new Date().toISOString().slice(0, 10),
          active: true,
        },
        newData: {
          branchId,
          branchName,
          assignmentDate: new Date().toISOString().slice(0, 10),
          endDate: new Date().toISOString().slice(0, 10),
          active: false,
        },
      }),
    )

    await page.goto('/auditoria')
    const row = page.getByRole('row').filter({ hasText: unassignReason })
    await expect(row).toBeVisible()
    await expect(row).toContainText('Desasignación')
    await expect(row).toContainText('Usuario')

    await row.getByRole('button', { name: 'Ver detalle' }).click()
    const detailDialog = page.getByRole('dialog')
    await expect(detailDialog.getByRole('heading', { name: 'Detalle del cambio' })).toBeVisible()
    await expect(detailDialog.getByText(unassignReason)).toBeVisible()
    const jsonBlocks = detailDialog.locator('.audit-detail__json')
    await expect(jsonBlocks.nth(1)).toContainText('"active": false')
    await expect(jsonBlocks.nth(1)).toContainText(branchName)
    await evidence(page, '06-detalle-log-desasignacion')
  })
})
