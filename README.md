# Intelligent Nutrition

Plataforma integral para la gestión nutricional inteligente. Monorepo que contiene el frontend (React + Vite), el backend (NestJS + Prisma) y la infraestructura de desarrollo (Docker Compose).

## Tabla de contenidos

- [Descripción general](#descripción-general)
- [Arquitectura del sistema](#arquitectura-del-sistema)
- [Stack tecnológico](#stack-tecnológico)
- [Estructura del repositorio](#estructura-del-repositorio)
- [Requisitos previos](#requisitos-previos)
- [Inicio rápido](#inicio-rápido)
- [Configuración de variables de entorno](#configuración-de-variables-de-entorno)
- [Ejecución en local](#ejecución-en-local)
  - [Opción A: Docker Compose (recomendada)](#opción-a-docker-compose-recomendada)
  - [Opción B: Ejecución individual](#opción-b-ejecución-individual)
- [Testing y QA](#testing-y-qa)
- [CI/CD](#cicd)
- [Despliegue](#despliegue)
- [Flujo de trabajo](#flujo-de-trabajo)
- [Documentación adicional](#documentación-adicional)
- [Equipo](#equipo)

---

## Descripción general

Intelligent Nutrition es un sistema compuesto por:

- **Backend:** API REST desarrollada con NestJS, que gestiona autenticación, usuarios, roles y health checks. Persiste datos en PostgreSQL mediante Prisma ORM.
- **Frontend:** Aplicación web desarrollada con React y Vite, que consume la API del backend.
- **Base de datos:** PostgreSQL 17, orquestada con Docker Compose en desarrollo y desplegada en Render en producción.

El proyecto sigue una estrategia de ramas simplificada basada en GitFlow, con `main` como rama estable y `develop` como rama de integración.

---

## Arquitectura del sistema

Arquitectura cliente-servidor.

---

## Stack tecnológico

| Capa                | Tecnología      | Versión                       | Propósito                   |
| ------------------- | --------------- | ----------------------------- | --------------------------- |
| **Backend**         | NestJS          | ^11.0.1                       | Framework HTTP              |
|                     | TypeScript      | ^5.7.3                        | Lenguaje                    |
|                     | Prisma          | 7.6.0                         | ORM y migraciones           |
|                     | Passport + JWT  | ^0.7.0 / ^4.0.1               | Autenticación               |
|                     | Argon2          | ^0.45.1                       | Hash de contraseñas         |
|                     | Resend          | ^6.28.1                       | Emails transaccionales      |
| **Frontend**        | React           | (ver `frontend/package.json`) | UI                          |
|                     | Vite            | (ver `frontend/package.json`) | Build tool                  |
|                     | TypeScript      | (ver `frontend/package.json`) | Lenguaje                    |
| **Base de datos**   | PostgreSQL      | 17 (Alpine)                   | Persistencia                |
| **Infraestructura** | Docker          | 24+                           | Contenedores                |
|                     | Docker Compose  | v2                            | Orquestación local          |
| **Testing**         | Jest            | ^30.0.0                       | Tests unitarios             |
|                     | Supertest       | ^7.0.0                        | Tests E2E                   |
| **CI/CD**           | Azure Pipelines | —                             | Gate de PR + sincronización |
|                     | GitHub          | —                             | Repositorio espejo          |
|                     | Render          | —                             | Despliegue de producción    |

---

## Estructura del repositorio

```
intelligent-nutrition/
│
├── backend/                          # API NestJS
│   ├── prisma/
│   │   ├── schema.prisma            # Modelos de datos
│   │   ├── migrations/              # Migraciones versionadas
│   │   └── prisma.config.ts         # Configuración Prisma 7
│   ├── src/
│   │   ├── main.ts                  # Bootstrap
│   │   ├── app.module.ts            # Módulo raíz
│   │   ├── common/                  # Decoradores, guards, utils
│   │   ├── config/                  # Configuración
│   │   ├── database/                # PrismaService
│   │   ├── health/                  # Health check
│   │   └── modules/                 # Módulos de negocio
│   │       ├── auth/
│   │       ├── email/
│   │       ├── roles/
│   │       └── users/
│   ├── test/                        # Tests E2E
│   ├── Dockerfile                   # Build de producción
│   ├── Dockerfile.test              # Runner de tests
│   ├── package.json
│   └── README.md                    # Documentación del backend
│
├── frontend/                         # App React + Vite
│   ├── src/
│   ├── public/
│   ├── Dockerfile                   # Build + Nginx
│   ├── package.json
│   └── README.md
│
├── docker-compose.yml                # Stack de desarrollo
├── docker-compose.test.yml           # Stack de testing
├── Dockerfile.smoke                  # Imagen del smoke test
├── smoke-test.sh                     # Script de smoke test
├── azure-pipelines.yml               # Pipeline CI/CD
├── SMOKE-TESTS.md                    # Documentación de tests
├── Contributing.md                   # Guía de contribución
├── .gitignore
├── .editorconfig
└── README.md                         # Este archivo
```

---

## Requisitos previos

### Para Docker (recomendado)

- **Docker Desktop** 4.x o superior
- **Docker Compose** v2 (incluido en Docker Desktop)
- **Git**

### Para ejecución individual

- **Node.js** 22.x
- **npm** 10.x
- **PostgreSQL** 17 (local o remoto)
- **Git**

---

## Inicio rápido

Para tener el stack completo corriendo en menos de 2 minutos:

```bash
# 1. Clonar el repositorio
git clone <URL_DEL_REPO>
cd intelligent-nutrition

# 2. Levantar backend + frontend + base de datos
docker compose up --build -d

# 3. Verificar que todo funciona
curl http://localhost:3000/health
# Esperado: {"status":"ok"}

# 4. Abrir el frontend
# http://localhost:5173
```

**Detener el stack:**

```bash
docker compose down
```

**Ver logs:**

```bash
docker compose logs -f
```

---

## Configuración de variables de entorno

### Backend

Crea `backend/.env` a partir del ejemplo:

```bash
cp backend/.env.example backend/.env
```

Variables requeridas:

| Variable                              | Descripción                        | Ejemplo                               |
| ------------------------------------- | ---------------------------------- | ------------------------------------- |
| `DATABASE_URL`                        | Conexión a PostgreSQL              | `postgresql://user:pass@host:5432/db` |
| `JWT_SECRET`                          | Secreto para firmar JWT            | Cadena larga y aleatoria              |
| `JWT_EXPIRES_IN`                      | Expiración del token               | `15m`                                 |
| `RESEND_API_KEY`                      | API key de Resend                  | `re_xxxxxxxx`                         |
| `RESEND_FROM_EMAIL`                   | Remitente de emails                | `noreply@tudominio.com`               |
| `RESEND_REPLY_TO_EMAIL`               | Reply-to de emails                 | `soporte@tudominio.com`               |
| `BRAND_LOGO_URL`                      | URL del logo                       | `https://tudominio.com/logo.png`      |
| `ACTIVATION_TOKEN_EXPIRATION_MINUTES` | Expiración del token de activación | `30`                                  |
| `FRONTEND_URL`                        | URL del frontend                   | `http://localhost:5173`               |

### Frontend

El frontend usa variables con prefijo `VITE_`. Consulta `frontend/.env.example` para la lista completa.

> **Nota:** El archivo `.env` está en `.gitignore`. Nunca subas credenciales al repositorio.

---

## Ejecución en local

### Opción A: Docker Compose (recomendada)

Levanta el stack completo (PostgreSQL + Backend + Frontend):

```bash
# Stack completo
docker compose up --build -d

# Solo backend + base de datos (útil para desarrollo del backend)
docker compose up postgres backend --build -d

# Solo frontend + backend + base de datos
docker compose up postgres backend frontend --build -d
```

**Servicios expuestos:**

| Servicio   | URL                   |
| ---------- | --------------------- |
| Backend    | http://localhost:3000 |
| Frontend   | http://localhost:5173 |
| PostgreSQL | localhost:5432        |

**Comandos útiles:**

```bash
# Ver estado de los servicios
docker compose ps

# Ver logs de un servicio específico
docker compose logs -f backend

# Ejecutar comandos dentro del contenedor del backend
docker compose exec backend npx prisma migrate deploy

# Reiniciar un servicio
docker compose restart backend

# Detener y eliminar volúmenes (borra datos de la BD)
docker compose down -v
```

### Opción B: Ejecución individual

Útil cuando necesitas iterar rápido con hot-reload o debugger.

#### Backend

```bash
cd backend

# Instalar dependencias
npm ci

# Generar cliente Prisma
npx prisma generate

# Aplicar migraciones
npx prisma migrate deploy

# Iniciar en modo desarrollo
npm run start:dev
```

El backend estará en `http://localhost:3000`.

#### Frontend

```bash
cd frontend

# Instalar dependencias
npm ci

# Iniciar en modo desarrollo
npm run dev
```

El frontend estará en `http://localhost:5173`.

#### Base de datos

Si no usas Docker, necesitas PostgreSQL 17 corriendo localmente. Actualiza `DATABASE_URL` en `backend/.env` apuntando a tu instancia local.

**Conectar a Render desde local:**

Render provee dos URLs por base de datos:

| Tipo             | Uso                                           |
| ---------------- | --------------------------------------------- |
| **Internal URL** | Solo desde servicios de Render (misma región) |
| **External URL** | Desde local, CI o herramientas externas       |

Para conectar desde local, usa la **External URL** que encuentras en:

> Render Dashboard → Tu base de datos → **Info** → **Connections** → **External Database URL**

> **Advertencia:** Conectar desde local a la BD de Render añade latencia (el tráfico viaja por internet público). Úsalo solo para desarrollo.

---

## Testing y QA

El proyecto cuenta con varios niveles de testing, todos orquestados con Docker Compose.

### Smoke test (post-despliegue)

Verifica que el stack completo responde correctamente:

```bash
docker compose -f docker-compose.yml -f docker-compose.test.yml --profile smoke up --build
```

**Verifica:**

1. `GET /health` responde 200 sin token
2. El body es `{ "status": "ok" }`
3. El frontend responde 200

### Tests de Bootstrap (gate de PR)

Verifica que `AppModule` compila sin errores de inyección de dependencias:

```bash
docker compose -f docker-compose.yml -f docker-compose.test.yml --profile test up --build
```

### Tests unitarios del backend

```bash
cd backend
node --experimental-vm-modules node_modules/jest/bin/jest.js
```

### Tests E2E

```bash
cd backend
npm run test:e2e
```

> **Más información:** Consulta [`SMOKE-TESTS.md`](./SMOKE-TESTS.md) para la documentación completa de los flujos de testing.

---

## CI/CD

El proyecto usa **Azure Pipelines** como plataforma de CI/CD, con **GitHub** como repositorio espejo y **Render** como plataforma de despliegue.

### Flujo completo

```
Desarrollador hace merge a "main" en Azure Repos
       ↓
Azure Pipeline se dispara (azure-pipelines.yml)
       ↓
El pipeline hace "git push" de la rama main hacia GitHub
       ↓
GitHub recibe el código actualizado
       ↓
Render detecta el cambio en GitHub (Webhook automático)
       ↓
Render construye y despliega el backend
```

### Pipeline de sincronización

El archivo `azure-pipelines.yml` en la raíz define el pipeline que:

1. Se dispara al hacer merge a `main`
2. Hace checkout del repositorio de Azure
3. Configura el remoto de GitHub usando un PAT almacenado en un Variable Group
4. Hace `push` forzado de la rama `main` hacia GitHub

### Gate de PR

El pipeline de PR ejecuta los tests de bootstrap del backend en un contenedor Docker antes de permitir el merge.

### Costos

| Plataforma      | Plan gratuito                                 | Límite                         |
| --------------- | --------------------------------------------- | ------------------------------ |
| Azure Pipelines | 1 job paralelo, 1,800 min/mes                 | Suficiente para sincronización |
| GitHub Actions  | 2,000 min/mes (privado) o ilimitado (público) | No usado actualmente           |
| Render          | Web Service gratuito                          | Con cold starts                |

> **Nota:** Como el pipeline de Azure solo hace un `git push` (menos de 1 minuto por ejecución), es muy poco probable que se superen los límites gratuitos.

---

## Despliegue

### Backend en Render

1. Render Dashboard → **New** → **Web Service**
2. Conectar el repositorio de **GitHub**
3. Configurar:
   - **Name:** `intelligent-nutrition-backend`
   - **Branch:** `main`
   - **Root Directory:** `backend`
   - **Runtime:** `Docker`
   - **Dockerfile Path:** `Dockerfile`
4. Configurar variables de entorno (usar **Internal Database URL** de Render)
5. Health Check Path: `/health`
6. Create Web Service

### Frontend en Render

> **Estado:** Pendiente. Se desplegará cuando el frontend esté listo.

1. Render Dashboard → **New** → **Web Service**
2. Conectar el repositorio de **GitHub**
3. Configurar:
   - **Name:** `intelligent-nutrition-frontend`
   - **Branch:** `main`
   - **Root Directory:** `frontend`
   - **Runtime:** `Docker`
   - **Dockerfile Path:** `Dockerfile`
4. Configurar variables de entorno (incluir `VITE_API_URL` apuntando al backend en Render)
5. Create Web Service

---

## Flujo de trabajo

El proyecto sigue las convenciones definidas en [`Contributing.md`](./Contributing.md). Resumen:

### Ramas

| Rama         | Propósito                    |
| ------------ | ---------------------------- |
| `main`       | Código estable en producción |
| `develop`    | Integración de desarrollo    |
| `feature/*`  | Nuevas funcionalidades       |
| `bug/*`      | Corrección de bugs           |
| `fix/*`      | Correcciones puntuales       |
| `refactor/*` | Refactorizaciones            |
| `docs/*`     | Documentación                |
| `chore/*`    | Mantenimiento                |

### Commits

Formato: `<type>(<scope>): <description> AB#<id>`

Ejemplos:

```
feat(auth): add login endpoint AB#45
fix(users): validate email format AB#52
docs(readme): update installation guide AB#139
```

### Pull Requests

- Mínimo **2 revisores**
- El autor **no puede aprobar su propio PR**
- Work Item de Azure Boards asociado
- Todos los comentarios resueltos
- Validaciones automáticas exitosas

---

## Documentación adicional

| Documento                                    | Descripción                           |
| -------------------------------------------- | ------------------------------------- |
| [`Contributing.md`](./Contributing.md)       | Guía completa de contribución         |
| [`SMOKE-TESTS.md`](./SMOKE-TESTS.md)         | Documentación de tests de humo        |
| [`backend/README.md`](./backend/README.md)   | Documentación específica del backend  |
| [`frontend/README.md`](./frontend/README.md) | Documentación específica del frontend |

---

## Equipo

| Rol                | Responsable    |
| ------------------ | -------------- |
| Backend Architect  | Fredy López    |
| Frontend Architect | Natalia Bernal |
| QA                 | Fabian Correa  |
| Business Analyst   | Karen Castro   |
| Project Manager    | Juan Moreno    |

---

## Licencia

Proyecto privado. Todos los derechos reservados.

---

**Última actualización:** 2026-09-18
