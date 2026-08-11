# Problemas conocidos y límites — Analista de Gastos IA v1.0

## Pendientes bloqueantes para producción técnica completa

- `TEST_DATABASE_URL` contiene credenciales inválidas.
- No se ha ejecutado satisfactoriamente la batería completa de integración contra la base PostgreSQL separada.
- Falta documentar el resultado de esa integración.

## Validación operativa pendiente

- Falta observar una ejecución automática real iniciada por el scheduler exactamente en la ventana de las 21:00 locales.
- La prueba real existente fue controlada y manual mediante el mismo servicio del scheduler.

## Límites deliberados de v1.0

- Canal automático único: Telegram.
- No incluye desglose por persona, tarjeta o instrumento.
- No hace preguntas ni mantiene conversación desde el cierre.
- No genera Excel, PDF ni reportes extensos.
- No reclasifica asignaciones AMBIGUOUS o UNMATCHED.
- No modifica gastos, presupuestos ni asignaciones.
- No crea presupuestos ni reglas.
- No produce pronósticos, estrategia financiera ni recomendaciones de CFO.
- No ejecuta automatizaciones financieras distintas del cierre diario.

## Estado de graduación

El Analista no está graduado definitivamente. Su estado es **APROBADO FUNCIONALMENTE EN PRUEBA CONTROLADA** hasta validar el disparo automático real de las 21:00 y resolver la integración PostgreSQL separada.
