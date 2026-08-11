# Smoke tests — Analista de Gastos IA v1.0

## Prueba real controlada del 5 de agosto de 2026

- **Workspace:** `00000000-0000-4000-8000-000000000007`
- **Tipo:** ejecución manual mediante el mismo servicio del scheduler
- **Fecha local:** 2026-08-05
- **Resultado de Telegram:** `ok=true`
- **DailyCloseDelivery:** `DELIVERED`
- **Mounjaro:** 6256.75 de 6500 MXN; 96.2577 %; `ATTENTION`
- **BudgetNotificationState:** `ATTENTION`
- **Segunda ejecución:** `ALREADY_DELIVERED`
- **Segundo mensaje enviado:** no
- **Estado:** APROBADO

Mensaje entregado:

```text
📊 Cierre de gastos — 5 ago 2026

Hoy: $6,625.75
Mes: $6,625.75
Presupuesto mensual: 6.5%

🟡 Mounjaro lleva 96.3% de su presupuesto mensual.
```

## Validación automatizada

- Pruebas unitarias: 243/243 aprobadas.
- Typecheck: aprobado.
- Lint: aprobado.
- Build: aprobado.
- Integración completa con `TEST_DATABASE_URL`: pendiente por credenciales inválidas.

## Smoke test pendiente de las 21:00

1. Mantener la API activa antes de las 21:00 locales.
2. No ejecutar previamente el endpoint manual para esa fecha.
3. Confirmar que el scheduler usa `Workspace.timezone`.
4. Confirmar un único `sendMessage` con `ok=true`.
5. Confirmar `DailyCloseDelivery=DELIVERED`.
6. Confirmar que los estados presupuestales entregados se reflejan en `BudgetNotificationState`.
7. Reiniciar la API y confirmar que el cierre no se reenvía.

Estado de esta validación: **PENDIENTE**. No debe declararse graduación definitiva antes de completarla.
