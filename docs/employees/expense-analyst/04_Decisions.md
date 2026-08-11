# Decisiones — Analista de Gastos IA v1.0

## 1. PostgreSQL y código para cálculos

- **Fecha:** 2026-08-05
- **Motivo:** Los importes financieros deben ser reproducibles y auditables.
- **Alternativas:** IA o cálculo dentro del mensaje.
- **Decisión:** Prisma, PostgreSQL y `Decimal` son responsables de sumar y calcular porcentajes.
- **Impacto:** La IA no decide importes ni estados.

## 2. Usar occurredAt y zona horaria persistida

- **Fecha:** 2026-08-05
- **Motivo:** `createdAt` no representa necesariamente la fecha del gasto y UTC fijo rompe el día local.
- **Alternativas:** Fecha de creación o zona fija.
- **Decisión:** Usar `Expense.occurredAt` y `Workspace.timezone`.
- **Impacto:** Día, mes y scheduler comparten la fecha operativa local.

## 3. Separar naturalezas financieras

- **Fecha:** 2026-08-05
- **Motivo:** Gastar, ahorrar e invertir no tienen el mismo significado.
- **Alternativas:** Un único total mensual.
- **Decisión:** Mantener `EXPENSE`, `SAVING` e `INVESTMENT` separados.
- **Impacto:** El estado del cierre de gastos no se contamina con ahorro o inversión.

## 4. Hacer visible la información incompleta

- **Fecha:** 2026-08-05
- **Motivo:** No ocultar incertidumbre ni asignar silenciosamente a Otros.
- **Alternativas:** Ignorar o clasificar por defecto.
- **Decisión:** Exponer `AMBIGUOUS`, `UNMATCHED` y gastos sin asignación.
- **Impacto:** El estado puede ser `DATA_INCOMPLETE`.

## 5. Aislar los umbrales en una política

- **Fecha:** 2026-08-05
- **Motivo:** Los umbrales deben ser verificables y reemplazables sin alterar consultas.
- **Alternativas:** Condiciones dispersas en servicios o prompts.
- **Decisión:** Centralizar `NORMAL`, `ATTENTION`, `EXCEEDED` y `CRITICAL` en `ExpenseAnalysisPolicy`.
- **Impacto:** No existe decisión probabilística.

## 6. Notificar transiciones y no estados repetidos

- **Fecha:** 2026-08-05
- **Motivo:** Repetir cada noche la misma alerta reduce su valor.
- **Alternativas:** Informar todas las partidas diariamente.
- **Decisión:** Persistir `BudgetNotificationState` por periodo.
- **Impacto:** Una partida reaparece solo cuando cambia de estado o ante consulta explícita.

## 7. Separar análisis generado de mensaje entregado

- **Fecha:** 2026-08-05
- **Motivo:** Una consulta o un fallo de Telegram no debe consumir una alerta.
- **Alternativas:** Marcar como notificado al calcular.
- **Decisión:** Confirmar `BudgetNotificationState` únicamente después de `ok=true`.
- **Impacto:** La memoria representa notificaciones realmente entregadas.

## 8. Programar por reloj local del Workspace

- **Fecha:** 2026-08-05
- **Motivo:** Cada empresa debe recibir el cierre a sus propias 21:00.
- **Alternativas:** Cron UTC global o zona hardcodeada.
- **Decisión:** El scheduler evalúa `Workspace.timezone`.
- **Impacto:** Soporta Workspaces en zonas horarias distintas.

## 9. Idempotencia persistente de entregas

- **Fecha:** 2026-08-05
- **Motivo:** Reinicios y ejecuciones concurrentes no deben duplicar mensajes.
- **Alternativas:** Memoria del proceso.
- **Decisión:** Crear `DailyCloseDelivery` con restricción única.
- **Impacto:** `DELIVERED` no se reenvía y `FAILED` admite reintento controlado.

## 10. Validar manualmente antes de graduar

- **Fecha:** 2026-08-05
- **Motivo:** No esperar hasta las 21:00 para comprobar integración e idempotencia.
- **Alternativas:** Declarar terminado con pruebas unitarias.
- **Decisión:** Ejecutar una prueba real mediante el mismo servicio del scheduler.
- **Impacto:** La funcionalidad está aprobada en prueba controlada, pero la graduación definitiva espera una ejecución automática real a las 21:00.
