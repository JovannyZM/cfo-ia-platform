# CFO IA

Esqueleto inicial de la plataforma SaaS B2B CFO IA. Es un monorepo TypeScript con NestJS,
Next.js, PostgreSQL, Prisma, pnpm y Turborepo.

## Requisitos

- Node.js 22 o superior
- pnpm 9.15.4
- Dos bases gratuitas de Prisma Postgres: una de desarrollo y otra exclusiva para pruebas

## Instalación y ejecución

1. Instala las dependencias:

   ```bash
   corepack enable
   corepack prepare pnpm@9.15.4 --activate
   pnpm install
   ```

2. Crea el archivo de entorno:

   En macOS/Linux:

   ```bash
   cp .env.example .env
   ```

   En PowerShell:

   ```powershell
   Copy-Item .env.example .env
   ```

3. Completa `DATABASE_URL` y `TEST_DATABASE_URL` en `.env` con dos bases distintas de Prisma
   Postgres. Nunca confirmes este archivo en Git.

4. Genera Prisma, aplica la migración inicial y carga el seed en `DATABASE_URL`:

   ```bash
   pnpm db:generate
   pnpm db:migrate
   pnpm db:seed
   ```

5. Inicia las tres aplicaciones:

   ```bash
   pnpm dev
   ```

   - Panel de clientes: http://localhost:3000
   - API: http://localhost:3001
   - Panel administrativo: http://localhost:3002
   - Health check: http://localhost:3001/health

## Autenticación local provisional

Los endpoints protegidos requieren `x-user-id`. El header sólo transporta la identidad: la API
consulta el usuario y sus roles en PostgreSQL y nunca acepta roles enviados por el cliente.

Usuarios creados por el seed:

| Usuario             | UUID                                   | Rol              |
| ------------------- | -------------------------------------- | ---------------- |
| `admin@cfoia.local` | `00000000-0000-4000-8000-000000000001` | `PLATFORM_ADMIN` |
| `owner@example.com` | `00000000-0000-4000-8000-000000000002` | `ACCOUNT_OWNER`  |

Cuenta demo: `00000000-0000-4000-8000-000000000003`.

Ejemplos:

```bash
curl http://localhost:3001/me/accounts \
  -H "x-user-id: 00000000-0000-4000-8000-000000000002"

curl -X POST \
  http://localhost:3001/accounts/00000000-0000-4000-8000-000000000003/tax-profile-requests \
  -H "content-type: application/json" \
  -H "x-user-id: 00000000-0000-4000-8000-000000000002" \
  -d '{"rfc":"COSC8001137NA","legalName":"Contribuyente de Prueba"}'
```

Para aprobar la solicitud del seed, primero hay que iniciar revisión:

```bash
curl -X POST \
  http://localhost:3001/admin/tax-profile-requests/00000000-0000-4000-8000-000000000006/start-review \
  -H "x-user-id: 00000000-0000-4000-8000-000000000001"

curl -X POST \
  http://localhost:3001/admin/tax-profile-requests/00000000-0000-4000-8000-000000000006/approve \
  -H "x-user-id: 00000000-0000-4000-8000-000000000001"
```

La aprobación cambia el estado, crea `TaxProfile`, crea `SubscriptionItem` y registra
`AuditEvent` dentro de una única transacción Prisma. No existe `POST /tax-profiles`.

## Comandos de calidad

```bash
pnpm test
pnpm typecheck
pnpm lint
pnpm build
```

## Telegram (MVP de un solo usuario)

Configura en el `.env` de la raíz:

```dotenv
TELEGRAM_BOT_TOKEN=
TELEGRAM_WORKSPACE_ID=00000000-0000-4000-8000-000000000007
TELEGRAM_API_USER_ID=00000000-0000-4000-8000-000000000002
TELEGRAM_INTERNAL_API_URL=http://localhost:3001
```

Al iniciar `pnpm dev`, el adaptador usa long polling. Cada fotografía recibida se descarga en
memoria, se envía como multipart al endpoint existente
`POST /workspaces/:workspaceId/expenses/evidence` y se elimina de memoria al terminar la
petición. El bot no procesa comandos, menús, botones ni historial.

## Estructura

```text
apps/api       API NestJS
apps/web       panel mínimo de clientes (Next.js App Router)
apps/admin     panel mínimo interno (Next.js App Router)
packages/database          Prisma, migración y seed
packages/domain            reglas de transición y normalización
packages/config            validación Zod del entorno
packages/typescript-config TypeScript strict compartido
packages/eslint-config     ESLint flat config compartido
```

## Alcance de esta etapa

No incluye integraciones con OpenAI, mensajería, pagos, navegadores, tickets ni un proveedor de
autenticación.

## Pruebas de integración con PostgreSQL

Las pruebas usan exclusivamente PostgreSQL real mediante `TEST_DATABASE_URL`. La configuración
rechaza una URL ausente o idéntica a `DATABASE_URL`, y sólo dentro del proceso de Vitest asigna
`TEST_DATABASE_URL` a la variable que Prisma consume.

1. En [Prisma Console](https://console.prisma.io), crea dos proyectos gratuitos con Prisma
   Postgres.
2. Copia la cadena de conexión del proyecto de desarrollo a `DATABASE_URL` en `.env`.
3. Copia la cadena del proyecto exclusivo de pruebas a `TEST_DATABASE_URL`.
4. Verifica que las URLs sean diferentes.
5. Ejecuta:

   ```bash
   pnpm test:integration
   ```

La suite reinicia el esquema configurado por `TEST_DATABASE_URL`, aplica la migración desde vacío,
ejecuta el seed y limpia los datos al terminar. La base de pruebas debe ser desechable y no debe
contener información que quieras conservar.

Secuencia completa:

```powershell
pnpm install
pnpm db:generate
pnpm db:migrate
pnpm db:seed
pnpm test
pnpm test:integration
pnpm typecheck
pnpm lint
pnpm build
```
