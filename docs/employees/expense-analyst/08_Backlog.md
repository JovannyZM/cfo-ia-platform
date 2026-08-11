# Backlog — Analista de Gastos IA

## Cierre de v1.0

1. Reparar las credenciales de `TEST_DATABASE_URL`.
2. Ejecutar la batería completa de integración con PostgreSQL real y base separada.
3. Documentar comandos, resultados y cualquier error pendiente.
4. Observar el scheduler en una ejecución automática real a las 21:00 locales.
5. Confirmar en esa ejecución: Telegram `ok=true`, `DailyCloseDelivery=DELIVERED` y actualización correcta de `BudgetNotificationState`.
6. Confirmar al día siguiente que una partida sin cambio no se repite.
7. Evaluar la graduación definitiva únicamente después de completar los puntos anteriores.

## Fuera de v1.0

- Otros canales automáticos.
- Configuración de horario por Workspace distinta de las 21:00.
- Desglose por persona o instrumento.
- Reportes Excel o PDF.
- Pronósticos y recomendaciones estratégicas.
- Funciones del CFO IA.

Estos elementos no forman parte de la deuda bloqueante actual y requieren priorización independiente.
