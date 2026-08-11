# Auxiliar de Gastos IA

- **Nombre del empleado:** Auxiliar de Gastos IA
- **Nombre técnico:** `expense-assistant` / `ExpenseAssistantWorker`
- **Versión:** 1.0
- **Estado:** APROBADO FUNCIONALMENTE.
- **Fecha de graduación funcional:** 2026-08-04.
- **Validación técnica completa:** PENDIENTE.
- **Producción técnica completa:** PENDIENTE.
- **Motivo pendiente:** No se ha ejecutado satisfactoriamente la integración PostgreSQL completa porque las credenciales de `TEST_DATABASE_URL` son inválidas.
- **Misión:** Registrar gastos empresariales confiables a partir de una sola entrada, conservando trazabilidad y solicitando únicamente la información obligatoria ausente.
- **Objetivo:** Convertir texto, fotografía o PDF de un solo comprobante en un `Expense` auditable, sin inventar información ni duplicar registros.
- **Jefe directo:** Brain.

## Entradas permitidas

- Texto de un gasto, un gasto por mensaje.
- Respuestas a una `ConversationSession` activa.
- Fotografía JPEG, PNG o WebP de un comprobante.
- PDF `application/pdf` de una sola página y máximo 10 MB.
- Eventos `ExpenseTextReceived` y `ExpenseEvidenceInterpreted`.

## Salidas

- `ExpenseRegistered`.
- `ExpenseInformationRequired`.
- Sesión `NEW_EXPENSE` cuando faltan datos.
- Resumen de gasto registrado mediante el adaptador de Telegram.
- Respuestas de revisión, duplicado, documento inválido o política de no corrección.

## Responsabilidades

- Validar los datos estructurados del gasto.
- Registrar una sola fila `Expense` y su `AuditEvent`.
- Calcular `baseAmount` con código y tipos decimales.
- Resolver instrumentos conocidos por Workspace, tipo y últimos cuatro dígitos.
- Pedir solamente los datos obligatorios faltantes.
- Preservar el expediente durante continuaciones y reinicios.
- Respetar la política de publicación, cancelación y duplicados.

## Límites

- No decide qué Worker debe ejecutarse.
- No conversa directamente con Telegram.
- No conserva archivos ni imágenes.
- No modifica gastos publicados.
- No cancela sin la jerarquía autorizada.
- No interpreta múltiples gastos o comprobantes en una entrada.
- No realiza reportes, presupuestos, inventario, ventas o cobranza.

## Qué sí hace

- Registra gastos por texto, foto y PDF válido.
- Normaliza importes mexicanos y métodos de pago.
- Extrae comercio, concepto, fecha, importe, moneda, método e instrumento cuando son observables.
- Aprende titular e instrumento por `workspaceId + type + last4`.
- Detecta una carga binariamente idéntica mediante SHA-256.
- Mantiene conversaciones incompletas en PostgreSQL.
- Cancela lógicamente cuando existe autorización y motivo.

## Qué NO hace

- No inventa datos ni responsables.
- No guarda evidencia binaria, base64 o archivos temporales.
- No corrige un `Expense` publicado.
- No procesa PDFs multipágina, estados de cuenta, contratos o cotizaciones.
- No acepta dos gastos en el mismo mensaje.
- No usa IA para sumar, normalizar métodos de pago o aplicar permisos.
- No ejecuta lógica de otros empleados.

## Dependencias

- Brain y `WorkerRegistry`.
- `ConversationSessionService`.
- `EvidenceController` y `ExpenseInterpreterWorker`.
- `ExpenseEvidenceInterpreter` y su adaptador OpenAI.
- PostgreSQL y Prisma.
- `AuditEvent`.
- `LanguageNormalizer` y normalizadores determinísticos.
- Adaptador de Telegram como transporte.

## KPIs

- Porcentaje de gastos registrados sin intervención adicional.
- Porcentaje que requiere una sola pregunta.
- Precisión de importe, comercio, fecha, método y documento.
- Tasa de duplicados bloqueados antes de OpenAI.
- Tasa de documentos enviados a revisión o rechazados.
- Número de gastos duplicados creados: objetivo cero.
- Número de gastos publicados modificados: objetivo cero.
- Porcentaje de registros con `AuditEvent`: objetivo 100 %.

## Backlog v1.1

- Validar más CFDI reales de distintos emisores.
- Mejorar observabilidad sanitizada del intérprete sin guardar contenido sensible.
- Resolver la advertencia de fuentes estándar de PDF.js.
- Reparar `TEST_DATABASE_URL`.
- Ejecutar la integración PostgreSQL completa.
- Documentar el resultado real de la integración.
- Evaluar configuración futura de reglas de anomalías; no implementada en v1.0.
