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

## Paginación de listados

Todos los listados usan el componente `Pagination` (`src/components/ui/Pagination.tsx`)
y el hook `usePagination` (`src/hooks/usePagination.ts`), así se comportan igual y
siguen la sección 2.4 del contrato de la API.

### `usePagination`

Lee y escribe en la URL la página, el tamaño de página, la búsqueda y los filtros,
así que se conservan al recargar o al volver de un detalle.

| Parámetro en la URL | Valor                                                                 |
| ------------------- | --------------------------------------------------------------------- |
| `pagina`            | Página actual. Se omite cuando es la 1.                               |
| `porPagina`         | Tamaño de página (10, 20 o 50). Se omite cuando es el de por defecto. |
| `q`                 | Búsqueda confirmada con la lupa o con Enter.                          |
| Filtros propios     | Por ejemplo `estado`. Se omiten cuando valen `todos`.                 |

Reglas:

- Buscar, cambiar un filtro o cambiar el tamaño de página vuelve a la página 1.
- "Limpiar filtros" quita la búsqueda y los filtros, pero conserva el tamaño de página.
- Un tamaño de página que no esté en las opciones se ignora, para no enviar al backend
  un `limit` inválido (más de 100 devuelve `400 INVALID_PAGINATION`).
- `params` trae `{ page, limit, search }` listos para la petición; `search` es
  `undefined` cuando no hay búsqueda.

### `Pagination`

- Es un `nav` con nombre accesible (`label`), con botones numerados; la página actual
  se marca con `aria-current="page"`.
- Muestra "Mostrando X–Y de Z" en una región `aria-live`, para que los lectores de
  pantalla anuncien el cambio.
- Si recibe `total`, `limit`, `limitOptions` y `onLimitChange`, muestra el selector
  "Filas por página".
- No se muestra cuando todo cabe en una página y no hay tamaño de página que cambiar.

### Ejemplo

```tsx
const FILTER_DEFAULTS = { estado: 'todos' }

export function CategoriesPage() {
  const { params, filters, limitOptions, setPage, setLimit, applySearch, setFilter } =
    usePagination({ filters: FILTER_DEFAULTS })

  const { categories, meta } = useCategories({
    ...params,
    active: ACTIVE_FILTER_VALUES[filters.estado],
  })

  return (
    <>
      <SearchBar
        id="categories-search"
        label="Buscar"
        value={params.search ?? ''}
        onSearch={applySearch}
      />
      <CategoriesTable categories={categories} />
      {meta && (
        <Pagination
          page={meta.page}
          totalPages={meta.totalPages}
          total={meta.total}
          limit={params.limit}
          limitOptions={limitOptions}
          label="Paginación de categorías"
          onChange={setPage}
          onLimitChange={setLimit}
        />
      )}
    </>
  )
}
```

## Convenciones

El flujo de ramas, commits y Pull Requests sigue lo definido en
`Contribuiting.md` en la raíz del repositorio.
