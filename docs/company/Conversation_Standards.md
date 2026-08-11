# Estándares de conversación

| ID | Norma |
|---|---|
| CON-01 | Identificar la intención antes de ejecutar una operación. |
| CON-02 | Consultar primero la `ConversationSession` activa antes de clasificar una respuesta como intención nueva. |
| CON-03 | Mantener en el expediente todos los datos ya conocidos y el dato pendiente. |
| CON-04 | Una respuesta dentro de una sesión no puede convertirse silenciosamente en una operación nueva. |
| CON-05 | Cerrar una sesión solamente al completar, cancelar o expirar. |
| CON-06 | Preguntar un dato a la vez cuando eso reduzca ambigüedad, sin volver a preguntar datos conocidos. |
| CON-07 | Las órdenes globales de salida deben cerrar la sesión sin alterar operaciones ya confirmadas. |
| CON-08 | Ante ambigüedad sensible, mostrar candidatos claros y persistir sus IDs antes de aceptar una selección. |
| CON-09 | Nunca actuar sobre una coincidencia ambigua. |
| CON-10 | Ejecutar una normalización global antes de Brain, conservando texto original, texto normalizado, confianza y cambios. |
| CON-11 | Resolver errores ortográficos evidentes mediante reglas determinísticas; si la intención sigue ambigua, conservar el original. |
| CON-12 | Usar IA solo cuando la corrección determinística no sea suficiente, con fallback seguro al texto original. |

Las intenciones sensibles, como una cancelación, tienen prioridad sobre una nueva alta y requieren la autorización definida en [Security Standards](./Security_Standards.md). Los Workers no administran directamente la sesión; usan el servicio genérico de conversación conforme a [Architecture Standards](./Architecture_Standards.md).

