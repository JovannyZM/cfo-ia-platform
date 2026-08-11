# Registro de estado de Employees

| Empleado | Área | Versión | Estado | Misión | Fecha de inicio | Fecha de graduación | Pruebas reales | Deuda técnica | Backlog | Responsable |
|---|---|---|---|---|---|---|---|---|---|---|
| [Auxiliar de Gastos IA](../employees/expense-assistant/01_Profile.md) | Gastos | 1.0 | APROBADO FUNCIONALMENTE | Registrar gastos empresariales confiables desde una entrada, con trazabilidad y preguntas solo por datos obligatorios faltantes. | 2026-07-29 | 2026-08-04 | Texto, fotografía, Telegram y PDF/CFDI documentados; continuación final del CFDI permanece pendiente. | Integración completa pendiente por credenciales inválidas de `TEST_DATABASE_URL`; advertencia de fuentes PDF.js. | [Backlog v1.1](../employees/expense-assistant/01_Profile.md#backlog-v11) | No documentado |
| [Analista de Gastos IA](../employees/expense-analyst/01_Profile.md) | Análisis de gastos | 1.0 | APROBADO FUNCIONALMENTE EN PRUEBA CONTROLADA | Calcular el estado de gastos y entregar un cierre diario breve, determinístico e idempotente. | 2026-08-05 | PENDIENTE | Análisis real, Telegram `ok=true`, Delivery `DELIVERED`, Mounjaro `ATTENTION` y no duplicación aprobados; ejecución automática real de las 21:00 pendiente. | Integración completa pendiente por credenciales inválidas de `TEST_DATABASE_URL`; falta validar el disparo automático real de las 21:00. | [Backlog](../employees/expense-analyst/08_Backlog.md) | No documentado |

`APROBADO FUNCIONALMENTE` no afirma que la integración completa esté aprobada. El detalle verificable está en [Test Cases](../employees/expense-assistant/06_Test_Cases.md) y [Known Issues](../employees/expense-assistant/08_Known_Issues.md).

`APROBADO FUNCIONALMENTE EN PRUEBA CONTROLADA` tampoco equivale a graduación definitiva. El Analista requiere la validación automática real de las 21:00 y la integración PostgreSQL separada antes de declarar producción técnica completa.
