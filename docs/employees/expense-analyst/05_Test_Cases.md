# Casos de prueba — Analista de Gastos IA v1.0

Estado oficial: **APROBADO FUNCIONALMENTE EN PRUEBA CONTROLADA**.

| ID | Caso | Resultado | Estado |
|---|---|---|---|
| ANA-001 | Total diario por `occurredAt` | Respeta límites de zona horaria | APROBADO |
| ANA-002 | Total mensual | Suma Decimal del mes local | APROBADO |
| ANA-003 | Gasto `CANCELLED` | Excluido | APROBADO |
| ANA-004 | Naturalezas | EXPENSE, SAVING e INVESTMENT separados | APROBADO |
| ANA-005 | Presupuesto mensual | Solo MONTHLY EXPENSE en porcentaje global | APROBADO |
| ANA-006 | Presupuesto anual | Acumula desde año o vigencia | APROBADO |
| ANA-007 | ASSIGNED | Alimenta el Budget asignado | APROBADO |
| ANA-008 | UNMATCHED | Importe y conteo visibles | APROBADO |
| ANA-009 | AMBIGUOUS | Importe y conteo visibles | APROBADO |
| ANA-010 | Datos incompletos | Estado global DATA_INCOMPLETE | APROBADO |
| ANA-011 | Umbral menor de 80 % | NORMAL | APROBADO |
| ANA-012 | Umbral 80–99.9999 % | ATTENTION | APROBADO |
| ANA-013 | Umbral 100–110 % | EXCEEDED | APROBADO |
| ANA-014 | Umbral mayor de 110 % | CRITICAL | APROBADO |
| ANA-015 | Prioridad global | CRITICAL prevalece sobre DATA_INCOMPLETE | APROBADO |
| ANA-016 | Primera alerta | ATTENTION se menciona una vez | APROBADO |
| ANA-017 | Sin cambio posterior | No repite la partida | APROBADO |
| ANA-018 | ATTENTION → EXCEEDED | Notifica transición | APROBADO |
| ANA-019 | EXCEEDED → CRITICAL | Notifica transición | APROBADO |
| ANA-020 | Estado descendente | Notifica recuperación | APROBADO |
| ANA-021 | Periodo mensual nuevo | Usa una nueva `periodKey` | APROBADO |
| ANA-022 | Consulta bajo demanda | No modifica estado notificado | APROBADO |
| ANA-023 | Ejecución a las 21:00 | Usa zona del Workspace | APROBADO |
| ANA-024 | Fecha local | No usa UTC fijo | APROBADO |
| ANA-025 | Workspaces en zonas distintas | Ejecuta solo los que alcanzaron 21:00 | APROBADO |
| ANA-026 | Día sin movimientos | Envía `Hoy: $0` | APROBADO |
| ANA-027 | Telegram `ok=true` | Marca entrega y notificación | APROBADO |
| ANA-028 | Fallo de Telegram | FAILED y estado no consumido | APROBADO |
| ANA-029 | Fallo del análisis | No envía mensaje parcial | APROBADO |
| ANA-030 | Doble ejecución | Segunda ejecución no envía | APROBADO |
| ANA-031 | Reinicio simulado | No duplica DELIVERED | APROBADO |
| ANA-032 | Reintento de FAILED | Reutiliza la entrega y puede completar | APROBADO |
| ANA-033 | Prueba real del análisis | Workspace demo, 5 ago 2026 | APROBADO |
| ANA-034 | Prueba real Telegram controlada | `ok=true`, Delivery DELIVERED | APROBADO |
| ANA-035 | Mounjaro real | 96.2577 %, estado notificado ATTENTION | APROBADO |
| ANA-036 | No duplicación real | Segunda ejecución ALREADY_DELIVERED | APROBADO |
| ANA-037 | Ejecución automática real a las 21:00 | Pendiente de observación | PENDIENTE |
| ANA-038 | Integración completa PostgreSQL separada | `TEST_DATABASE_URL` inválida | PENDIENTE |

Resultado automatizado registrado: **243/243 pruebas unitarias aprobadas**, además de typecheck, lint y build aprobados.
