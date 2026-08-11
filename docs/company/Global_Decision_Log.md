# Registro global de decisiones

Solo contiene decisiones reutilizables a nivel plataforma. Las decisiones exclusivas de gastos permanecen en [Decisions del Auxiliar](../employees/expense-assistant/04_Decisions.md).

| ID | Fecha | Decisión | Motivo | Alternativas | Impacto | Empleados afectados | Estado |
|---|---|---|---|---|---|---|---|
| GDL-001 | 2026-07-29 | Workers puros sin `EventBus`; Brain publica sus resultados. | Responsabilidad única y pruebas aisladas. | Publicación directa desde Worker. | Menor acoplamiento y causalidad uniforme. | Todos | VIGENTE |
| GDL-002 | 2026-07-29 | Ejecutar Workers secuencialmente en orden de registro. | Orden determinístico. | Paralelismo. | Un fallo detiene la cadena sin resultados parciales del Worker fallido. | Todos | VIGENTE |
| GDL-003 | 2026-07-29 | Usar EventBus en memoria para el MVP. | Evitar infraestructura distribuida prematura. | Kafka, RabbitMQ, Redis. | Simplicidad; los eventos no sobreviven reinicios. | Todos | VIGENTE |
| GDL-004 | 2026-07-29 | Brain no conoce Workers concretos; usa `WorkerRegistry`. | Extensibilidad sin ramas específicas. | `switch` o rutas por Employee. | Agregar un Employee no exige modificar Brain. | Todos | VIGENTE |
| GDL-005 | 2026-07-30 | Mantener Evidence efímera cuando no sea necesaria su conservación. | Minimizar infraestructura y datos sensibles. | Objeto persistente, S3, base64 o archivos. | Menor superficie operativa; no existe archivo histórico. | Employees con archivos | VIGENTE |
| GDL-006 | 2026-07-30 | Aislar proveedores externos detrás de una interfaz, validar salida y usar fakes en automatización. | Determinismo, costo, seguridad y reemplazabilidad. | Integración directa y llamadas reales en CI. | Tests sin secretos; la prueba real sigue siendo obligatoria. | Employees con proveedores externos | VIGENTE |
| GDL-007 | 2026-07-31 | Tratar Telegram y futuros canales como adaptadores delgados. | Reutilizar el núcleo y evitar lógica de negocio en el canal. | Flujos separados dentro de cada bot. | Los canales comparten Brain y Workers. | Todos con conversación | VIGENTE |
| GDL-008 | 2026-08-04 | Persistir una `ConversationSession` genérica. | El contexto en memoria se perdía y cambiaba intenciones. | Estado en el canal o memoria del proceso. | Continuidad tras reinicios y una intención activa por conversación. | Employees conversacionales | VIGENTE |
| GDL-009 | 2026-08-04 | Conservar registros relevantes mediante transiciones auditables, no borrado físico. | Integridad y trazabilidad. | Borrado o edición silenciosa. | Historial preservado. | Employees con registros sensibles | VIGENTE |
| GDL-010 | 2026-08-04 | Resolver acciones ambiguas mediante selección segura con IDs persistidos. | Evitar actuar sobre coincidencias inciertas. | Aumentar coincidencia difusa o elegir automáticamente. | Selección determinística y auditable. | Employees con acciones sensibles | VIGENTE |
| GDL-011 | 2026-08-04 | Cerrar y graduar un Employee antes de abrir el siguiente; mejoras menores pasan al backlog. | Costo de oportunidad y reducción de regresiones. | Mantener refinamiento indefinido o varios frentes. | Versiones cerrables y foco de producto. | Todos | VIGENTE |

