# CFO IA — Production Deployment

## Estado

Preparación técnica completada para Railway. El Go Live cloud y las pruebas reales permanecen pendientes hasta conectar el repositorio y configurar sus secretos en Railway.

## Proveedor y arquitectura

- Proveedor recomendado: Railway.
- Un solo servicio API NestJS, siempre activo y con una sola réplica.
- PostgreSQL oficial: Neon mediante `DATABASE_URL`; Railway no crea ni reemplaza la base.
- Telegram: long polling dentro del proceso API. No se usa webhook en esta versión.
- Scheduler: `DailyCloseSchedulerService` dentro del mismo proceso, evaluado cada minuto y ejecutado a las 21:00 de `Workspace.timezone`.
- Foto y PDF: procesamiento en memoria, máximo 10 MB. No se persisten archivos ni se requiere volumen.
- PAE/Playwright: instalado pero deshabilitado mediante `PAE_ENABLED`; queda fuera del Go Live.

## Runtime y comandos

- Node.js: 22.x.
- pnpm: 9.15.4 mediante Corepack.
- Build API y dependencias: `pnpm turbo run build --filter=@cfo-ia/api...`.
- Prisma Client: `pnpm db:generate`.
- Migraciones de producción: `pnpm db:deploy` (`prisma migrate deploy`).
- Inicio de producción: `pnpm --filter @cfo-ia/api start`.
- Nunca usar `migrate dev`, seed, `tsx`, watch o `nest start --watch` en producción.

Railway usa [railway.json](../../railway.json) para instalar, generar Prisma, compilar, aplicar migraciones y arrancar la API.
El builder declarado es `RAILPACK`, con la raíz del monorepo como contexto.

## Variables

### Obligatorias y secretas

- `DATABASE_URL`: conexión oficial de Neon.
- `OPENAI_API_KEY`: interpretación de fotografías y PDFs.
- `TELEGRAM_BOT_TOKEN`: long polling y respuestas Telegram.

### Obligatorias no secretas

- `NODE_ENV=production`.
- `OPENAI_MODEL`.
- `TELEGRAM_WORKSPACE_ID`.
- `TELEGRAM_API_USER_ID`.

### Opcionales

- `OPENAI_TIMEOUT_MS`: por defecto 30000.
- `TELEGRAM_INTERNAL_API_URL`: omitir en Railway; se usa `127.0.0.1:$PORT`.
- `PAE_ENABLED=false`.
- `PAE_SESSION_TIMEOUT_MS`, `PAE_SCREENSHOT_DIR`, `PAE_BROWSER_EXECUTABLE_PATH`: solo PAE.

### Desarrollo y pruebas

- `PORT`: 3001 local; Railway lo inyecta en cloud.
- `TEST_DATABASE_URL`: base PostgreSQL separada para integración. Su configuración inválida actual es deuda técnica y no afecta `DATABASE_URL`.
- `NEXT_PUBLIC_API_URL`: solo aplicaciones web.

Nunca copiar `.env` al repositorio ni registrar tokens, claves, URLs con credenciales o contenidos completos de comprobantes.

## Healthcheck y resiliencia

- Endpoint público: `GET /health`.
- Respuesta sana: HTTP 200 con `{"status":"ok","database":"ok"}`.
- Si PostgreSQL falla: HTTP 503 sin incluir credenciales ni detalles internos.
- Railway reinicia el proceso ante fallos según `restartPolicyType=ON_FAILURE`.
- La API escucha `0.0.0.0` y el `PORT` inyectado.
- Nest activa shutdown hooks. Telegram aborta long polling y el scheduler limpia su temporizador durante shutdown.

## Telegram

- Debe existir exactamente una réplica cloud.
- Mantener deployment overlap en 0 para no solapar dos procesos de long polling.
- Un HTTP 409 de `getUpdates` se registra como `TELEGRAM_POLLING_CONFLICT`.
- Tras validar cloud, detener cualquier API local con el mismo bot. La laptop no debe ejecutar long polling normal mientras Railway esté activo.
- Logs esperados: inicio de adapter, long polling activo, conflictos/errores y detención limpia.

## Scheduler

- Lee `Workspace.timezone`; no usa la zona horaria del servidor para decidir la fecha/hora local.
- `DailyCloseDelivery` evita dobles envíos por workspace, fecha local, canal y conversación.
- Los reintentos de entregas fallidas conservan idempotencia.
- `BudgetNotificationState` se actualiza únicamente después de una entrega confirmada por Telegram.
- Los metadatos Telegram (`message_id`, `message.date`, `chat.id`, `ok`) permanecen separados de `attemptedAt` y `deliveredAt`.

## Configuración Railway

1. Conectar el repositorio desde Railway usando la raíz del monorepo.
2. Mantener una sola réplica.
3. Configurar las variables obligatorias en el panel Variables, nunca en archivos.
4. Generar un dominio público y conservar `/health` como healthcheck.
5. Verificar que pre-deploy ejecute `prisma migrate deploy` y que no ejecute seed.

## Validación de Go Live

No declarar producción completa hasta comprobar desde cloud:

1. `/health` devuelve 200 y PostgreSQL `ok`.
2. Texto Telegram registra, clasifica y responde.
3. Foto Telegram registra y responde.
4. PDF Telegram registra y responde.
5. Ejecución controlada del mismo servicio de cierre entrega por Telegram.
6. Un reinicio Railway recupera API, long polling y scheduler sin duplicados.
7. Con la API local detenida, un nuevo mensaje Telegram sigue siendo atendido por cloud.

## Troubleshooting

- `TELEGRAM_POLLING_CONFLICT`: detener la instancia local u otra réplica cloud.
- Health 503: verificar conectividad y `DATABASE_URL` en Railway; no ejecutar reset.
- Foto/PDF fallan: comprobar `OPENAI_API_KEY`, `OPENAI_MODEL`, timeout y límite de 10 MB.
- Scheduler no entrega: revisar `Workspace.timezone`, conversación Telegram existente y `DailyCloseDelivery`.
- Build nativo falla: confirmar Node 22 y que `@napi-rs/canvas` instaló su binario Linux.

## Retorno temporal a local

1. Detener primero el deployment Railway para evitar dos pollers.
2. Configurar `.env` local con los mismos nombres, sin copiarlo a Git.
3. Ejecutar `pnpm install`, `pnpm db:generate`, `pnpm --filter @cfo-ia/api build` y `pnpm --filter @cfo-ia/api start`.
4. Confirmar `/health` y el log de long polling antes de usar Telegram.

Para volver a cloud, detener la API local antes de iniciar Railway.
