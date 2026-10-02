import type { Role, User } from '../../types/user'

export const MOCK_ROLES: Role[] = [
  { id: 'role-superadmin', name: 'SUPERADMIN', active: true },
  { id: 'role-branch-leader', name: 'BRANCH_LEADER', active: true },
  { id: 'role-branch-assistant', name: 'BRANCH_ASSISTANT', active: true },
]

function buildUser(
  id: string,
  firstName: string,
  lastName: string,
  email: string,
  role: Role,
  branches: { id: string; name: string }[] = [],
  overrides: Partial<User> = {},
): User {
  return {
    id,
    personId: `person-${id}`,
    person: { id: `person-${id}`, firstName, lastName, email, phone: null, address: null },
    role: { id: role.id, name: role.name },
    branches,
    active: true,
    mustChangePassword: false,
    lastLoginAt: '2026-09-14T14:20:00.000Z',
    createdAt: '2026-08-01T10:00:00.000Z',
    updatedAt: '2026-09-14T14:20:00.000Z',
    ...overrides,
  }
}

const [superadmin, leader, assistant] = MOCK_ROLES
const makro = { id: 'branch-makro', name: 'Sede Makro' }
const viva = { id: 'branch-viva', name: 'Sede Viva' }
const sogamoso = { id: 'branch-sogamoso', name: 'Sede Sogamoso' }

export const MOCK_USERS: User[] = [
  buildUser('u-1', 'Natalia', 'Bernal', 'natalia.bernal@intelligent.co', superadmin, [
    makro,
    viva,
    sogamoso,
  ]),
  buildUser('u-2', 'Yulieth', 'Tarazona', 'yulieth.tarazona@intelligent.co', leader, [makro]),
  buildUser('u-3', 'Juan', 'Moreno', 'juan.moreno@intelligent.co', assistant, [makro]),
  buildUser('u-4', 'Andrés', 'Pineda', 'andres.pineda@intelligent.co', leader, [viva]),
  buildUser('u-5', 'Laura', 'Suescún', 'laura.suescun@intelligent.co', assistant, [viva]),
  buildUser('u-6', 'Diego', 'Camargo', 'diego.camargo@intelligent.co', leader, [sogamoso]),
  buildUser('u-7', 'Camilo', 'Rojas', 'camilo.rojas@intelligent.co', assistant, [sogamoso], {
    mustChangePassword: true,
    lastLoginAt: null,
  }),
  buildUser('u-8', 'Sara', 'Quintero', 'sara.quintero@intelligent.co', assistant, [], {
    active: false,
    lastLoginAt: null,
  }),
]
