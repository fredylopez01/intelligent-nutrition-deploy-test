# Intelligent Nutrition — Frontend

Aplicación web del sistema de gestión de inventario y punto de venta para las
sedes de Intelligent Nutrition. Construida con **React + TypeScript + Vite**.

## Requisitos previos

- Node.js 20 o superior
- npm 10 o superior
- Backend corriendo (ver `docker-compose.yml` en la raíz del repositorio)

## Instalación

\`\`\`bash
npm install
\`\`\`

Copia el archivo de variables de entorno de ejemplo y ajústalo según tu entorno:

\`\`\`bash
cp .env.example .env.local
\`\`\`

> `.env.local` nunca debe subirse al repositorio (ver Contribuiting.md, sección 18).

## Scripts disponibles

| Comando                 | Descripción                                         |
| ----------------------- | --------------------------------------------------- |
| `npm run dev`           | Levanta el servidor de desarrollo con hot reload    |
| `npm run build`         | Compila TypeScript y genera el build de producción  |
| `npm run lint`          | Corre ESLint sobre todo el proyecto                 |
| `npm run lint -- --fix` | Corre ESLint y corrige automáticamente lo que pueda |
| `npm run preview`       | Sirve el build de producción localmente             |

## Calidad de código

El proyecto usa:

- **ESLint 10** con reglas de TypeScript, React Hooks, accesibilidad
  (`jsx-a11y`) y orden de imports (`import-x`).
- **Prettier** integrado como regla de ESLint (`prettier/prettier`), así que
  un error de formato se reporta igual que cualquier otro error de lint.

> Nota: `eslint-plugin-jsx-a11y` aún no declara soporte oficial para
> ESLint 10 en su `package.json` (funciona correctamente, solo falta que
> actualicen su rango de peer dependencies). Se instaló con
> `--legacy-peer-deps` únicamente para ese paquete. Revisar en futuras
> actualizaciones si ya lo soportan de forma nativa.

Antes de abrir un Pull Request, corre:

\`\`\`bash
npm run lint
npm run build
\`\`\`

## Estructura del proyecto

\`\`\`
src/
├── assets/ Imágenes y recursos estáticos
├── components/ Componentes reutilizables de UI
├── context/ Contextos de React (ej. sesión de usuario)
├── hooks/ Hooks personalizados (ej. useAuth, useUsers)
├── layouts/ Layouts compartidos (ej. AppLayout, AuthLayout)
├── pages/ Páginas/vistas de la aplicación
├── routes/ Configuración de rutas y protección por rol
├── services/ Llamadas a la API backend
├── types/ Tipos e interfaces de TypeScript
└── utils/ Funciones auxiliares
\`\`\`

## Convenciones

El flujo de ramas, commits y Pull Requests sigue lo definido en
`Contribuiting.md` en la raíz del repositorio.
