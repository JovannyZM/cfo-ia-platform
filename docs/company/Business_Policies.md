# Políticas generales de negocio

Estas políticas aplican a más de un Employee. Las reglas exclusivas de gastos permanecen en [Business Rules del Auxiliar](../employees/expense-assistant/02_Business_Rules.md).

| ID | Política |
|---|---|
| POL-01 | Los documentos contables confirmados no se modifican silenciosamente ni se eliminan físicamente. |
| POL-02 | Cuando aplique, una rectificación se representa mediante una transición auditable y un nuevo registro, no reescribiendo la historia. |
| POL-03 | Las acciones sensibles requieren autorización con roles y relaciones persistidas. |
| POL-04 | Toda acción financiera relevante debe producir auditoría. |
| POL-05 | PostgreSQL es la fuente oficial del estado del negocio. |
| POL-06 | Excel, PDF, presentaciones y mensajes son formatos derivados, no bases de datos. |
| POL-07 | Los datos y operaciones se aíslan por `Workspace`. |
| POL-08 | Las entidades empresariales —personas, instrumentos, centros de costos, proyectos o presupuestos— pertenecen al Workspace cuando existan en el dominio. |
| POL-09 | Brain orquesta; no ejecuta cálculos financieros. |
| POL-10 | Los cálculos financieros se realizan con código, tipos decimales y PostgreSQL; la IA interpreta y explica, pero no suma ni sustituye al motor de cálculo. |

La implementación de permisos y auditoría debe seguir [Security Standards](./Security_Standards.md).

