# Changelog — Analista de Gastos IA

## v0.1 — 2026-08-05

- Se creó el cálculo diario y mensual desde PostgreSQL.
- Se incorporó la separación EXPENSE, SAVING e INVESTMENT.
- Se añadieron presupuestos mensuales y anuales, asignaciones y datos incompletos.
- Se creó el endpoint de consulta y el primer formato de cierre.

## v0.2 — 2026-08-05

- Se definieron estados por Budget: NORMAL, ATTENTION, EXCEEDED y CRITICAL.
- Se creó `BudgetNotificationState`.
- Se cambió la política para notificar únicamente transiciones relevantes.
- Se separó la generación del análisis de la confirmación de entrega.

## v1.0 — 2026-08-05

- Se implementó el scheduler diario a las 21:00 según `Workspace.timezone`.
- Se creó `DailyCloseDelivery` con idempotencia persistente.
- Se implementaron estados PENDING, DELIVERED y FAILED.
- Se añadió reintento controlado de FAILED.
- Se conectó el envío real con Telegram y confirmación `ok=true`.
- Se ejecutó una prueba real controlada y una prueba real de no duplicación.
- Estado alcanzado: **APROBADO FUNCIONALMENTE EN PRUEBA CONTROLADA**.
- Validación automática real a las 21:00: pendiente.
- Producción técnica completa: pendiente por `TEST_DATABASE_URL` inválida.
