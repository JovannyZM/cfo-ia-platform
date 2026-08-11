# Changelog

## v0.1 — Infraestructura de Workers

- `DomainEvent`, Worker, registro, EventBus en memoria y Brain.
- Ejecución secuencial, propagación de trazabilidad y errores.

## v0.2 — Primer gasto estructurado

- Workspace y Expense.
- `ExpenseAssistantWorker`, `ExpenseRegistered` y auditoría.
- Validación de importes, monedas y tipo de cambio.

## v0.3 — Evidencia fotográfica

- Endpoint multipart en memoria.
- Intérprete OpenAI con salida Zod.
- Foto → Brain → gasto.

## v0.4 — Telegram

- Long polling, descarga de foto, reutilización del endpoint y respuesta al chat.
- Prueba de conexión aislada mediante texto exacto `prueba`.

## v0.5 — Texto conversacional

- Alta por texto.
- Normalización global y métodos de pago determinísticos.
- Captura gradual de importe, concepto, responsable y método.

## v0.6 — Instrumentos

- `PaymentInstrument` persistente.
- Aprendizaje por Workspace, tipo y últimos cuatro.
- Titular conocido asigna responsable.

## v0.7 — Sesiones persistentes

- `ConversationSession` genérica.
- Contexto de gasto incompleto sobreviviente a reinicios.
- Comandos globales de salida.

## v0.8 — Publicación y cancelación

- Política definitiva de no corrección.
- Cancelación lógica, permisos, motivo y auditoría.
- Selección segura numerada para ambigüedad.

## v0.9 — Calidad documental

- Conceptos útiles y presentación no redundante.
- Reglas de ticket/folio y exclusión de autorizaciones.
- SHA-256 para duplicados exactos.

## v1.0 — Foto, texto y PDF

- PDF de una página, texto seleccionable o renderizado en memoria.
- Límite de 10 MB y rechazo multipágina/no financiero.
- Duplicado exacto de PDF.
- Reglas CFDI: emisor, receptor, fecha de emisión, total, forma 03 y serie/folio.
- CFDI real Cyberpuerta interpretado con confianza 0.99.
- Aprobación funcional obtenida el 2026-08-04.
- Estado funcional: `APROBADO FUNCIONALMENTE`.
- Producción técnica completa: `PENDIENTE` hasta reparar `TEST_DATABASE_URL`, ejecutar la integración PostgreSQL completa y documentar su resultado.
