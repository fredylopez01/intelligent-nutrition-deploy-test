import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { UsersModule } from './users.module';
import { PrismaService } from '../prisma/prisma.service';

jest.mock('../prisma/prisma.service', () => {
  return {
    PrismaService: jest.fn().mockImplementation(() => ({
      userAccount: {
        findUnique: jest.fn(),
        create: jest.fn(),
      },
      role: {
        findUnique: jest.fn(),
      },
    })),
  };
});

describe('UsersController (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: any;

  const mockRole = { id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890', name: 'SUPERADMIN' };

  const mockUser = {
    id: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
    fullName: 'Juan Pérez',
    email: 'juan@test.com',
    roleId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    active: true,
    lastLoginAt: null,
    createdAt: '2026-09-14T03:07:44.280Z',
    updatedAt: '2026-09-14T03:07:44.280Z',
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [UsersModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }));
    await app.init();

    prisma = moduleFixture.get<PrismaService>(PrismaService);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('POST /users', () => {
    it('should create a user and return 201', async () => {
      prisma.userAccount.findUnique.mockResolvedValue(null);
      prisma.role.findUnique.mockResolvedValue(mockRole);
      prisma.userAccount.create.mockResolvedValue(mockUser);

      const response = await request(app.getHttpServer())
        .post('/users')
        .send({
          fullName: 'Juan Pérez',
          email: 'juan@test.com',
          password: 'password123',
          roleId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
        })
        .expect(201);

      expect(response.body).toEqual(mockUser);
      expect(response.body).not.toHaveProperty('passwordHash');
    });

    it('should return 409 when email already exists', async () => {
      prisma.userAccount.findUnique.mockResolvedValue(mockUser);

      await request(app.getHttpServer())
        .post('/users')
        .send({
          fullName: 'Juan Pérez',
          email: 'juan@test.com',
          password: 'password123',
          roleId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
        })
        .expect(409);
    });

    it('should return 404 when role does not exist', async () => {
      prisma.userAccount.findUnique.mockResolvedValue(null);
      prisma.role.findUnique.mockResolvedValue(null);

      await request(app.getHttpServer())
        .post('/users')
        .send({
          fullName: 'Juan Pérez',
          email: 'new@test.com',
          password: 'password123',
          roleId: '00000000-0000-0000-0000-000000000000',
        })
        .expect(404);
    });

    it('should return 400 when email is missing', async () => {
      await request(app.getHttpServer())
        .post('/users')
        .send({
          fullName: 'Juan Pérez',
          password: 'password123',
          roleId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
        })
        .expect(400);
    });

    it('should return 400 when password is too short', async () => {
      await request(app.getHttpServer())
        .post('/users')
        .send({
          fullName: 'Juan Pérez',
          email: 'juan@test.com',
          password: '123',
          roleId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
        })
        .expect(400);
    });

    it('should return 400 when roleId is missing', async () => {
      await request(app.getHttpServer())
        .post('/users')
        .send({
          fullName: 'Juan Pérez',
          email: 'juan@test.com',
          password: 'password123',
        })
        .expect(400);
    });

    it('should return 400 when email is invalid', async () => {
      await request(app.getHttpServer())
        .post('/users')
        .send({
          fullName: 'Juan Pérez',
          email: 'not-an-email',
          password: 'password123',
          roleId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
        })
        .expect(400);
    });
  });
});
