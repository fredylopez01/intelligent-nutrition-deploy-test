# Smoke Tests — Intelligent Nutrition Project

Verificación rápida de que el stack está operativo después de cada despliegue. **No bloquea PRs** — corre post-deployment.

## Flujos de prueba

### 1. Smoke test (post-despliegue)

```bash
./smoke-test.sh
```

Verifica el stack completo tras un deploy:

- `GET /api/v1/health` → responde 200 sin token y valida conexión a PostgreSQL
- Body del health → `{ "data": { "status": "ok" } }` (el interceptor global envuelve la respuesta en `data`)
- Frontend → responde 200

No usa Jest ni Node.js — solo `bash` + `curl`.

### 2. Bootstrap test (gate de PR)

```bash
cd backend
npm test -- app.module.spec
```

Verifica que `AppModule` compila sin errores de inyección de dependencias, incluido `HealthModule`. No necesita Docker ni BD. Corre como gate de merge en cada PR.

> La configuración de Jest vive en el bloque `jest` de `backend/package.json`; no existe un `jest.config.ts`.

### 3. Docker Compose profiles (CI/CD)

Desde la raíz del repositorio:

```bash
npm run smoke:docker   # smoke test del stack completo
npm run test:docker    # tests unitarios + e2e del backend
```

Ambos scripts están en el `package.json` de la raíz. Por debajo ejecutan, siempre con **ambos** archivos `-f` (porque `postgres`, `backend` y `frontend` están definidos en `docker-compose.yml`):

```bash
# Equivalente a npm run smoke:docker
docker compose -f docker-compose.yml -f docker-compose.test.yml --profile smoke up --build --abort-on-container-exit --exit-code-from smoke-test smoke-test

# Equivalente a npm run test:docker
docker compose -f docker-compose.yml -f docker-compose.test.yml --profile test up --build --abort-on-container-exit --exit-code-from test-runner test-runner
```

`--abort-on-container-exit --exit-code-from <servicio>` es obligatorio para que el comando termine y devuelva el veredicto; sin ellos el stack queda corriendo y `up` no reporta el resultado.

Si el backend no arranca (por ejemplo, por variables de entorno faltantes), el smoke test **no llega a ejecutarse** y Docker Compose aborta con `dependency failed to start`.

## Health endpoint

`GET /api/v1/health` (`backend/src/health/health.controller.ts`):

- Decorado con `@Public()` — bypass del guard global JWT, responde 200 sin token
- Ejecuta `SELECT 1` contra PostgreSQL vía `PrismaService`
- Retorna `{ "status": "ok" }` (el interceptor global lo envuelve como `{ "data": { "status": "ok" } }`)
- Si la BD no está accesible → Nest retorna 500 automáticamente

## Variables de entorno

El stack (`docker-compose.yml`) necesita el `.env` de la raíz completo. Si falta alguna de estas, el backend **no arranca** y el smoke test falla con `dependency failed to start`:

- `POSTGRES_*`, `DATABASE_URL_DOCKER`
- `JWT_SECRET`, `JWT_EXPIRES_IN`
- `RESEND_*` (`EmailService` valida al instanciarse)
- `STORAGE_*` (`StorageService` valida al instanciarse)
- `SEED_ADMIN_PASSWORD` (requerida por `backend-init`)

Todas están listadas en `.env.example`.

Variables propias del script:

| Variable         | Default                 | Descripción               |
| ---------------- | ----------------------- | ------------------------- |
| `BASE_URL`       | `http://localhost:3000` | URL del backend           |
| `FRONTEND_URL`   | `http://localhost:5173` | URL del frontend          |
| `MAX_RETRIES`    | `30`                    | Intentos máx. de espera   |
| `RETRY_INTERVAL` | `2`                     | Segundos entre reintentos |

## Exit codes

- `0` — todos los checks pasaron
- `1` — al menos un check falló

## Notas ESM / Jest

El proyecto usa ESM (`"type": "module"`). Jest debe correr en modo ESM nativo:

```bash
npm test
```

Requiere `npx prisma generate` antes de correr los tests (el cliente generado no se commitea).
