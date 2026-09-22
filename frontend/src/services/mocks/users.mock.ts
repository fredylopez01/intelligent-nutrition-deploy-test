import type { Role, User } from '../../types/user'

export const MOCK_ROLES: Role[] = [
  { id: 'role-superadmin', name: 'SUPER ADMIN', active: true },
  { id: 'role-lider', name: 'Lider de sede', active: true },
  { id: 'role-ayudante', name: 'Ayudante de sede', active: true },
]
function buildUser(
  id: string,
  fullName: string,
  email: string,
  role: Role,
  overrides: Partial<User> = {},
): User {
  return {
    id,
    fullName,
    email,
    active: true,
    mustChangePassword: false,
    lastLoginAt: '2026-09-14T14:20:00.000Z',
    createdAt: '2026-08-01T10:00:00.000Z',
    updatedAt: '2026-09-14T14:20:00.000Z',
    role: { id: role.id, name: role.name },
    ...overrides,
  }
}

const [superadmin, lider, ayudante] = MOCK_ROLES

export const MOCK_USERS: User[] = [
  buildUser('u-1', 'Natalia Bernal', 'natalia.bernal@intelligent.co', superadmin),
  buildUser('u-2', 'Yulieth Tarazona', 'yulieth.tarazona@intelligent.co', lider),
  buildUser('u-3', 'Juan Moreno', 'juan.moreno@intelligent.co', ayudante),
  buildUser('u-4', 'Andrés Pineda', 'andres.pineda@intelligent.co', lider),
  buildUser('u-5', 'Laura Suescún', 'laura.suescun@intelligent.co', ayudante),
  buildUser('u-6', 'Diego Camargo', 'diego.camargo@intelligent.co', lider),
  buildUser('u-7', 'Camilo Rojas', 'camilo.rojas@intelligent.co', ayudante, {
    mustChangePassword: true,
    lastLoginAt: null,
  }),
  buildUser('u-8', 'Sara Quintero', 'sara.quintero@intelligent.co', ayudante, {
    active: false,
    lastLoginAt: null,
  }),
]
