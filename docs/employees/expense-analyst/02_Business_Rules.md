# Reglas de negocio — Analista de Gastos IA v1.0

## Fuente y cálculo

1. PostgreSQL es la fuente oficial.
2. Los cálculos se realizan con código y `Decimal`; la IA no suma ni resta.
3. La fecha operativa es `Expense.occurredAt`, nunca `createdAt`.
4. Los límites diarios, mensuales y anuales respetan `Workspace.timezone`.
5. El scheduler no contiene una zona horaria fija.
6. Solo participan gastos `REGISTERED`.
7. Los gastos `CANCELLED` quedan excluidos de todos los totales.
8. El análisis no modifica `Expense`, `Budget` ni `ExpenseBudgetAssignment`.

## Naturalezas y periodos

9. `EXPENSE`, `SAVING` e `INVESTMENT` se calculan y presentan por separado.
10. El estado global de gastos se determina con presupuestos de naturaleza `EXPENSE`.
11. `SAVING` e `INVESTMENT` no se mezclan con el presupuesto mensual de gasto.
12. Un presupuesto mensual acumula desde el inicio del mes o de su vigencia, lo que ocurra después.
13. Un presupuesto anual acumula desde el inicio del año o de su vigencia, lo que ocurra después.
14. Solo se consideran presupuestos activos y vigentes para la fecha analizada.
15. El porcentaje mensual global usa únicamente presupuestos `MONTHLY` de naturaleza `EXPENSE`.

## Clasificación disponible

16. Los importes `ASSIGNED` alimentan el Budget asignado.
17. Una asignación `AMBIGUOUS` nunca se resuelve silenciosamente.
18. Una asignación `UNMATCHED` nunca se asigna automáticamente a Otros.
19. Un gasto sin `ExpenseBudgetAssignment` se reporta como no clasificado.
20. Los montos y conteos ambiguos y sin clasificar permanecen visibles.
21. La existencia de `AMBIGUOUS` o `UNMATCHED` produce estado global `DATA_INCOMPLETE`, salvo que exista un Budget `CRITICAL`.

## Estados por Budget

22. `NORMAL`: consumo menor de 80 %.
23. `ATTENTION`: consumo desde 80 % y menor de 100 %.
24. `EXCEEDED`: consumo desde 100 % y hasta 110 %.
25. `CRITICAL`: consumo mayor de 110 %.
26. Los umbrales son determinísticos y no dependen de IA.

## Estado global

27. `CRITICAL` tiene prioridad cuando existe al menos un Budget `CRITICAL`.
28. `DATA_INCOMPLETE` sigue cuando existen gastos ambiguos o sin clasificar.
29. `ATTENTION` aplica cuando existe al menos un Budget `ATTENTION` o `EXCEEDED`.
30. `NORMAL` aplica cuando no existe ninguna condición anterior.
31. El estado global puede aparecer todos los días.

## Política de alertas

32. `BudgetNotificationState` conserva el último estado realmente notificado por Workspace, Budget y periodo.
33. `periodKey` usa `YYYY-MM` para presupuestos mensuales y `YYYY` para anuales.
34. Calcular o consultar el análisis no actualiza `BudgetNotificationState`.
35. Una partida se menciona cuando entra por primera vez en `ATTENTION`.
36. Se menciona cuando cambia de `ATTENTION` a `EXCEEDED`.
37. Se menciona cuando cambia de `EXCEEDED` a `CRITICAL`.
38. Se menciona cuando baja de cualquier estado superior a uno inferior.
39. Un periodo nuevo mantiene su propia memoria de notificación.
40. Una consulta explícita puede mostrar detalle sin alterar la memoria de notificación.
41. Si el estado actual coincide con el último notificado, la partida no se repite.
42. `BudgetNotificationState` solo se actualiza después de que Telegram confirma `ok=true`.

## Cierre diario y entrega

43. El cierre se evalúa todos los días a partir de las 21:00 locales de cada Workspace.
44. La fecha del cierre se obtiene en la zona IANA del Workspace, no desde UTC fijo.
45. El canal v1.0 es Telegram.
46. El cierre se envía aunque no existan movimientos durante el día y debe mostrar `Hoy: $0`.
47. El mensaje conserva el acumulado mensual.
48. El cierre no hace preguntas ni invita a interactuar.
49. El cierre no incluye conteos de registros ni desglose por persona, tarjeta o instrumento.
50. Un análisis fallido no produce un mensaje parcial.

## Idempotencia y reintentos

51. `DailyCloseDelivery` identifica cada cierre por Workspace, fecha local, canal y conversación.
52. Solo puede existir una fila para esa combinación.
53. `PENDING` representa una ejecución reservada o en curso.
54. `DELIVERED` significa que Telegram confirmó la entrega.
55. `FAILED` conserva el error sanitizado y permite un reintento controlado.
56. Una entrega `DELIVERED` nunca se reenvía.
57. Reiniciar la API no elimina la memoria de entrega.
58. Si Telegram falla, la entrega queda `FAILED` y no se actualiza `BudgetNotificationState`.
59. Si el análisis falla, la entrega queda `FAILED`, no se envía y no se consume ninguna alerta.

## Límite frente al CFO IA

60. El Analista describe el estado de gastos y presupuestos; no dirige la empresa.
61. No produce estrategia, proyecciones, decisiones de inversión ni recomendaciones de dirección financiera.
62. La interpretación transversal y las decisiones ejecutivas pertenecen al futuro CFO IA.
