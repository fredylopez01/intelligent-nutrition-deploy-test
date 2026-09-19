# Smoke Tests — Intelligent Nutrition Project

Verificación rápida de que el stack está operativo después de cada despliegue. **No bloquea PRs** — corre post-deployment.

## Flujos de prueba

### 1. Smoke test (post-despliegue)

```bash
./smoke-test.sh
```

Verifica el stack completo tras un deploy:

- `GET /health` → responde 200 sin token
- Body del health → `{ "status": "ok" }`
- Frontend → responde 200

No usa Jest ni Node.js — solo `bash` + `curl`.

### 2. Bootstrap test (gate de PR)

```bash
cd backend
node --experimental-vm-modules node_modules/jest/bin/jest.js --config jest.config.ts --verbose app.module.spec
```

Verifica que `AppModule` compila sin errores de inyección de dependencias, incluido `HealthModule`. No necesita Docker ni BD. Corre como gate de merge en cada PR.

### 3. Docker Compose profiles (CI/CD)

```bash
# Smoke test en Docker
docker compose -f docker-compose.yml -f docker-compose.test.yml --profile smoke up --build

# Bootstrap test en Docker
docker compose -f docker-compose.yml -f docker-compose.test.yml --profile test up --build
```

## Health endpoint

`GET /health` (`backend/src/health/health.controller.ts`):

- Decorado con `@Public()` — bypass del guard global JWT, responde 200 sin token
- Ejecuta `SELECT 1` contra PostgreSQL vía `PrismaService`
- Retorna `{ "status": "ok" }`
- Si la BD no está accesible → Nest retorna 500 automáticamente

## Variables de entorno

| Variable | Default | Descripción |
|---|---|---|
| `BASE_URL` | `http://localhost:3000` | URL del backend |
| `FRONTEND_URL` | `http://localhost:5173` | URL del frontend |
| `MAX_RETRIES` | `30` | Intentos máx. de espera |
| `RETRY_INTERVAL` | `2` | Segundos entre reintentos |

## Exit codes

- `0` — todos los checks pasaron
- `1` — al menos un check falló

## Notas ESM / Jest

El proyecto usa ESM (`"type": "module"`). Jest debe correr en modo ESM nativo:

```bash
node --experimental-vm-modules node_modules/jest/bin/jest.js --config jest.config.ts
```

Requiere `npx prisma generate` antes de correr los tests (el cliente generado no se commitea).