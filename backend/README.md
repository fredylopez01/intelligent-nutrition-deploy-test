# Intelligent Nutrition — Backend

API REST del sistema Intelligent Nutrition, desarrollada con NestJS, Prisma y PostgreSQL.

## Tabla de contenidos

- [Descripción](#descripción)
- [Stack tecnológico](#stack-tecnológico)
- [Arquitectura](#arquitectura)
- [Requisitos previos](#requisitos-previos)
- [Instalación y configuración](#instalación-y-configuración)
- [Ejecución en local](#ejecución-en-local)
  - [Opción A: Con Docker Compose (recomendada)](#opción-a-con-docker-compose-recomendada)
  - [Opción B: Sin Docker (Node directo)](#opción-b-sin-docker-node-directo)
- [Scripts disponibles](#scripts-disponibles)
- [Base de datos y Prisma](#base-de-datos-y-prisma)
- [Testing](#testing)
- [Docker](#docker)
- [Despliegue en Render](#despliegue-en-render)
- [Troubleshooting](#troubleshooting)
- [Convenciones](#convenciones)

---

## Descripción

Backend de Intelligent Nutrition. Expone una API REST que gestiona autenticación, usuarios, roles y health checks. Está diseñado para ser consumido por el frontend y otros servicios internos.

**Repositorio:** Monorepo (backend + frontend + infraestructura).

**Rama principal de trabajo:** `develop`. Los despliegues a producción se disparan desde `main`.

---

## Stack tecnológico

| Componente | Versión | Propósito |
|---|---|---|
| Node.js | 22 (Alpine) | Runtime |
| NestJS | ^11.0.1 | Framework HTTP |
| TypeScript | ^5.7.3 | Lenguaje |
| Prisma | 7.6.0 | ORM / Migraciones |
| PostgreSQL | 17 (Docker) | Base de datos |
| Jest | ^30.0.0 | Testing |
| Argon2 | ^0.45.1 | Hash de contraseñas |
| Passport + JWT | ^0.7.0 / ^4.0.1 | Autenticación |
| Resend | ^6.28.1 | Envío de emails |

---

## Arquitectura

```
backend/
├── prisma/
│   ├── schema.prisma          # Definición de modelos
│   ├── migrations/            # Migraciones versionadas
│   └── prisma.config.ts       # Configuración de Prisma 7
├── src/
│   ├── main.ts                # Bootstrap de NestJS
│   ├── app.module.ts          # Módulo raíz
│   ├── app.controller.ts
│   ├── app.service.ts
│   ├── common/
│   │   ├── decorators/        # @Public, @CurrentUser, @Roles
│   │   ├── guards/            # JWT Auth Guard, Roles Guard
│   │   ├── interfaces/        # Tipos compartidos
│   │   └── utils/             # Utilidades (crypto, etc.)
│   ├── config/                # Configuración de la app
│   ├── database/
│   │   └── prisma/            # PrismaService y PrismaModule
│   ├── health/                # Health check endpoint
│   │   ├── health.controller.ts
│   │   └── health.module.ts
│   └── modules/
│       ├── auth/              # Login, activación, JWT
│       ├── email/             # Servicio de emails (Resend)
│       ├── roles/             # CRUD de roles
│       └── users/             # CRUD de usuarios
├── test/
│   └── jest-e2e.json
├── Dockerfile                 # Build de producción
├── Dockerfile.test            # Runner de tests (Jest ESM)
├── package.json
├── nest-cli.json
├── tsconfig.json
└── .env.example
```

### Módulos principales

| Módulo | Responsabilidad |
|---|---|
| `AuthModule` | Autenticación JWT, activación de cuentas, login |
| `UsersModule` | Gestión de usuarios (CRUD) |
| `RolesModule` | Gestión de roles y permisos |
| `HealthModule` | Health check con verificación de BD |
| `PrismaModule` | Conexión global a PostgreSQL |
| `EmailModule` | Envío de emails transaccionales vía Resend |

---

## Requisitos previos

### Para Docker (recomendado)
- **Docker Desktop** 4.x o superior
- **Docker Compose** v2 (incluido en Docker Desktop)

### Para ejecución directa
- **Node.js** 22.x
- **npm** 10.x
- **PostgreSQL** 17 (local o remoto)
- **Git**

---

## Instalación y configuración

### 1. Clonar el repositorio

```bash
git clone <URL_DEL_REPO>
cd intelligent-nutrition
```

### 2. Variables de entorno del backend

Crea `backend/.env` a partir del ejemplo:

```bash
cp backend/.env.example backend/.env
```

Edita `backend/.env` con los valores reales:

```env
# Base de datos
# Para Docker Compose local: usar el hostname "postgres"
# Para conexión a Render: usar la EXTERNAL URL de Render
DATABASE_URL="postgresql://intelligent_nutrition:change_me@localhost:5432/intelligent_nutrition?schema=public"

# JWT
JWT_SECRET="tu_secreto_largo_y_seguro"
JWT_EXPIRES_IN="15m"

# Email (Resend)
RESEND_API_KEY="re_xxxxxxxx"
RESEND_FROM_EMAIL="noreply@tudominio.com"
RESEND_REPLY_TO_EMAIL="soporte@tudominio.com"

# Branding
BRAND_LOGO_URL="https://tudominio.com/logo.png"

# Activación de cuentas
ACTIVATION_TOKEN_EXPIRATION_MINUTES=30

# Frontend (para enlaces en emails)
FRONTEND_URL="http://localhost:5173"
```

> **Importante:** El archivo `.env` está en `.gitignore`. Nunca lo subas al repositorio.

### 3. Instalar dependencias

```bash
cd backend
npm ci
```

El comando `postinstall` ejecutará `prisma skills sync` automáticamente (se ignora si falla).

### 4. Generar el cliente de Prisma

El cliente generado **no se commitea**. Debes generarlo localmente:

```bash
npx prisma generate
```

---

## Ejecución en local

### Opción A: Con Docker Compose (recomendada)

Levanta **solo el backend y PostgreSQL** desde la raíz del proyecto:

```bash
# Desde la raíz del repo
docker compose up postgres backend --build -d
```

Esto construye la imagen del backend usando `backend/Dockerfile` y arranca PostgreSQL con las credenciales del `docker-compose.yml`.

**Verificar que está corriendo:**

```bash
curl http://localhost:3000/health
# Esperado: {"status":"ok"}
```

**Ver logs:**

```bash
docker compose logs -f backend
```

**Detener:**

```bash
docker compose down
```

### Opción B: Sin Docker (Node directo)

Útil si quieres iterar rápido con hot-reload.

**Requisito:** Tener PostgreSQL corriendo (local o en Render).

**Pasos:**

```bash
cd backend

# 1. Asegurar que .env tiene el DATABASE_URL correcto
#    Si usas Render: pega la EXTERNAL URL

# 2. Generar cliente Prisma
npx prisma generate

# 3. Aplicar migraciones (si es la primera vez)
npx prisma migrate deploy

# 4. Iniciar en modo desarrollo (watch)
npm run start:dev
```

El servidor estará en `http://localhost:3000`.

**Si vas a conectar a la base de datos de Render:**

Reemplaza en `backend/.env`:

```env
DATABASE_URL="postgresql://USUARIO:PASSWORD@dpg-xxxxx.oregon-postgres.render.com:5432/NOMBRE_DB"
```

> **⚠️ Advertencia:** Conectar desde local a la BD de Render funciona, pero **cada conexión viaja por internet público**, lo que añade latencia. Úsalo solo para desarrollo y pruebas. Para el despliegue real, el backend en Render usará la **Internal URL** automáticamente.

---

## Scripts disponibles

Desde `backend/`:

| Comando | Descripción |
|---|---|
| `npm run build` | Compila TypeScript a `dist/` |
| `npm run start` | Inicia NestJS (sin watch) |
| `npm run start:dev` | Inicia con watch (desarrollo) |
| `npm run start:debug` | Inicia con debugger y watch |
| `npm run start:prod` | Inicia desde `dist/main` (producción) |
| `npm run format` | Formatea con Prettier |
| `npm run lint` | Linting con ESLint (con `--fix`) |
| `npm test` | Tests unitarios (Jest) |
| `npm run test:watch` | Tests en modo watch |
| `npm run test:cov` | Tests con cobertura |
| `npm run test:e2e` | Tests end-to-end |

---

## Base de datos y Prisma

### Modelos principales

| Modelo | Tabla | Descripción |
|---|---|---|
| `Role` | `role` | Roles del sistema (admin, user, etc.) |
| `UserAccount` | `user_account` | Cuentas de usuario con autenticación |

### Comandos de Prisma

```bash
cd backend

# Generar el cliente (obligatorio tras cambios en schema)
npx prisma generate

# Aplicar migraciones existentes (sin crear nuevas)
npx prisma migrate deploy

# Crear una nueva migración (desarrollo)
npx prisma migrate dev --name descripcion_del_cambio

# Abrir Prisma Studio (interfaz web)
npx prisma studio

# Sincronizar schema sin migración (solo desarrollo/prototipado)
npx prisma db push
```

### Flujo recomendado para cambios de schema

1. Editar `prisma/schema.prisma`
2. Ejecutar `npx prisma migrate dev --name nombre_del_cambio`
3. Esto crea la migración Y aplica los cambios
4. Ejecutar `npx prisma generate` (a veces lo hace migrate automáticamente)
5. Commitear el archivo de migración generado en `prisma/migrations/`

### Conexión a Render desde local

Render provee **dos URLs** por base de datos:

- **Internal URL** — solo desde servicios de Render en la misma región
- **External URL** — desde cualquier lugar (local, CI, herramientas externas)

Para conectar desde local, usa la **External URL** que encuentras en:
> Render Dashboard → Tu base de datos → **Info** → **Connections** → **External Database URL**

Si la conexión falla, verifica que el **Inbound IP Restrictions** de la base de datos permita tu IP (por defecto `0.0.0.0/0` = todas).

---

## Testing

### Tests unitarios (Jest + ESM)

El proyecto usa **ESM nativo** (`"type": "module"`). Jest debe correr con el flag de VM modules:

```bash
cd backend
node --experimental-vm-modules node_modules/jest/bin/jest.js
```

O usando el script:

```bash
npm test
```

**Nota:** El script `test` en `package.json` no incluye el flag de VM modules explícitamente, pero la configuración de Jest en `package.json` usa `useESM: true` y `extensionsToTreatAsEsm: [".ts"]`. Si experimentas errores de módulos, ejecuta manualmente:

```bash
node --experimental-vm-modules node_modules/jest/bin/jest.js --config package.json
```

### Tests E2E

```bash
npm run test:e2e
```

### Tests de Bootstrap (Docker)

El archivo `Dockerfile.test` del backend ejecuta Jest en un contenedor. Se usa en CI para el gate de PR:

```bash
# Desde la raíz del proyecto
docker compose -f docker-compose.yml -f docker-compose.test.yml --profile test up --build
```

### Smoke test

Verifica que el stack completo responde tras un despliegue:

```bash
# Desde la raíz
docker compose -f docker-compose.yml -f docker-compose.test.yml --profile smoke up --build
```

El smoke test verifica:
1. `GET /health` responde 200 sin token
2. El body es `{ "status": "ok" }`
3. El frontend responde 200 (cuando está desplegado)

---

## Docker

### Build de producción

```bash
cd backend
docker build -t intelligent-nutrition-backend .
```

### Ejecución standalone

```bash
docker run -p 3000:3000 \
  -e DATABASE_URL="postgresql://..." \
  -e JWT_SECRET="..." \
  intelligent-nutrition-backend
```

### Docker Compose (stack completo)

Desde la raíz del proyecto:

```bash
# Levantar solo backend + postgres
docker compose up postgres backend --build -d

# Levantar todo (backend + frontend + postgres)
docker compose up --build -d
```

### Perfiles de test

```bash
# Smoke test (verifica health + frontend)
docker compose -f docker-compose.yml -f docker-compose.test.yml --profile smoke up --build

# Tests de bootstrap (Jest en contenedor)
docker compose -f docker-compose.yml -f docker-compose.test.yml --profile test up --build
```

---

## Despliegue en Render

### Prerrequisitos

- Cuenta en Render (conectada a GitHub)
- Repositorio en GitHub con el código sincronizado desde Azure DevOps
- Base de datos PostgreSQL creada en Render

### Paso 1: Crear el Web Service

1. Render Dashboard → **New** → **Web Service**
2. Conectar el repositorio de **GitHub**
3. Configurar:
   - **Name:** `intelligent-nutrition-backend`
   - **Branch:** `main`
   - **Root Directory:** `backend`
   - **Runtime:** `Docker`
   - **Dockerfile Path:** `Dockerfile`

### Paso 2: Variables de entorno

| Variable | Valor | Dónde obtenerlo |
|---|---|---|
| `DATABASE_URL` | **Internal Database URL** | Render Dashboard → DB → Connections |
| `JWT_SECRET` | Tu secreto de producción | Generar uno seguro |
| `JWT_EXPIRES_IN` | `15m` (o el valor deseado) | — |
| `RESEND_API_KEY` | `re_xxxx` | Resend Dashboard |
| `RESEND_FROM_EMAIL` | `noreply@tudominio.com` | — |
| `FRONTEND_URL` | URL del frontend en producción | — |
| `PORT` | `3000` | Render lo asigna internamente |

> **Importante:** En Render, usa la **Internal Database URL** (no la External). Así la comunicación backend↔BD viaja por la red privada de Render, sin latencia adicional.

### Paso 3: Health Check

Configura el **Health Check Path** como `/health`. Render lo usará para verificar que el servicio está vivo.

### Paso 4: Desplegar

Haz clic en **Create Web Service**. Render construirá la imagen y desplegará.

**Verificar despliegue:**

```bash
curl https://tu-backend.onrender.com/health
# Esperado: {"status":"ok"}
```

---

## Troubleshooting

### Error: `P1001: Can't reach database server`

**Causas posibles:**
1. Estás usando la **Internal URL** desde fuera de Render → usa la **External URL**
2. La base de datos está en una región distinta al backend → Render solo permite Internal URL dentro de la misma región
3. El Inbound IP Restriction de la BD bloquea tu IP → verifica en Networking que sea `0.0.0.0/0` o incluya tu IP

### Error: `FATAL: No SNI information found`

Estás conectando usando una IP resuelta en lugar de la URL completa. Usa siempre el **hostname completo** de Render (ej. `dpg-xxxxx.oregon-postgres.render.com`).

### Error: `TLS handshake failed`

Render requiere **TLS 1.2 o superior** para conexiones externas. Verifica que tu cliente PostgreSQL lo soporte.

### Render no detecta el puerto del backend

Asegúrate de que `main.ts` escuche en `0.0.0.0`:

```typescript
await app.listen(process.env.PORT ?? 3000, "0.0.0.0");
```

Sin el `"0.0.0.0"`, NestJS escucha solo en localhost y Render no puede enrutar tráfico.

### Jest falla con errores de módulos ESM

El proyecto usa ESM nativo. Ejecuta Jest con:

```bash
node --experimental-vm-modules node_modules/jest/bin/jest.js
```

O verifica que el flag esté incluido en la ejecución del pipeline.

### `prisma generate` falla en CI

Asegúrate de que el pipeline ejecute `npx prisma generate` **antes** de correr tests o build. El cliente generado no se commitea.

---

## Convenciones

Este proyecto sigue las normas definidas en `Contributing.md`:

- **Commits:** Conventional Commits (`feat(scope): descripción AB#ID`)
- **Ramas:** `feature/*`, `bug/*`, `fix/*`, `refactor/*`, `docs/*`, `chore/*`
- **Pull Requests:** Mínimo 2 revisores, Work Item asociado
- **Trazabilidad:** Todo commit funcional referencia un Work Item (`AB#ID`)

**Work Item actual:** 139

---

## Contacto

| Rol | Responsable |
|---|---|
| Backend Architect | Fredy López |
| QA | Fabian Correa |
| Frontend Architect | Natalia Bernal |
| Business Analyst | Karen Castro |
| Project Manager | Juan Moreno |

---

**Última actualización:** 2026-09-18