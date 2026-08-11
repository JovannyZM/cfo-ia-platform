# Arquitectura — Analista de Gastos IA v1.0

## Flujo de cálculo

```text
PostgreSQL
  ├─ Workspace.timezone
  ├─ Expense
  ├─ Budget
  └─ ExpenseBudgetAssignment
          ↓
ExpenseAnalysisService
          ↓
ExpenseAnalysisPolicy
          ↓
ExpenseAnalysisResult
          ↓
DailyCloseMessageService
```

`ExpenseAnalysisService` consulta gastos `REGISTERED`, asignaciones y presupuestos vigentes. Usa `occurredAt` y la zona horaria del Workspace para construir los límites locales del día, mes y año. Separa `EXPENSE`, `SAVING` e `INVESTMENT` y nunca escribe sobre las entidades financieras consultadas.

`ExpenseAnalysisPolicy` asigna estados por Budget y calcula la prioridad del estado global. No usa IA.

`DailyCloseMessageService` convierte el resultado y las transiciones relevantes en el formato breve aprobado. No pregunta ni incluye desgloses personales o por tarjeta.

## Flujo automático de las 21:00

```text
DailyCloseSchedulerService
  ↓ lee Workspace.timezone
Reloj local >= 21:00
  ↓
Reserva DailyCloseDelivery(PENDING)
  ↓
BudgetNotificationService.prepareDailyClose
  ↓
Telegram sendMessage
  ├─ ok=true  → DailyCloseDelivery(DELIVERED)
  │             → BudgetNotificationState actualizado
  └─ error     → DailyCloseDelivery(FAILED)
                → BudgetNotificationState sin cambios
```

## Componentes persistentes

### BudgetNotificationState

Memoria por `workspaceId`, `budgetId` y `periodKey`. Registra `lastNotifiedStatus` y `lastNotifiedAt`. Su función es evitar repetir una alerta individual mientras la partida permanezca en el mismo estado.

### DailyCloseDelivery

Registro idempotente por `workspaceId`, `localDate`, `channel` y `conversationId`. Sus estados son `PENDING`, `DELIVERED` y `FAILED`. Sobrevive reinicios y permite reintentar fallos sin reenviar cierres ya entregados.

## Separación entre generación y entrega

Preparar un cierre calcula el análisis, detecta transiciones y genera texto, pero no consume alertas. Una entrega se considera efectiva únicamente cuando Telegram devuelve `ok=true`. Esta separación permite consultas bajo demanda sin cambiar la memoria operativa.

## Ejecución manual controlada

Existe un endpoint exclusivo de desarrollo que invoca el mismo `DailyCloseSchedulerService`. No contiene una segunda implementación. Se utilizó para validar Telegram, persistencia e idempotencia sin esperar a las 21:00.
