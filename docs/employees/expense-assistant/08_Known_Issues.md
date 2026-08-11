# Límites e incidencias conocidas

## Estado actual

- **Aprobación funcional:** APROBADO FUNCIONALMENTE desde 2026-08-04.
- **Validación técnica completa:** PENDIENTE.
- **Producción técnica completa:** PENDIENTE.

## Deuda técnica para completar la validación

- Reparar `TEST_DATABASE_URL`.
- Ejecutar la integración PostgreSQL completa.
- Documentar el resultado real de la integración.

La aprobación funcional no equivale a producción técnica completa.

## Límites e incidencias

- No procesa PDFs de varias páginas.
- No procesa varios comprobantes en un PDF.
- No procesa estados de cuenta.
- No procesa contratos.
- No procesa cotizaciones.
- No procesa XML CFDI.
- No procesa voz ni audio.
- No procesa video.
- No procesa dos gastos en un mensaje.
- No divide tickets con múltiples operaciones independientes.
- No ofrece búsqueda histórica avanzada por lenguaje.
- No ofrece reportes, Excel o PDF de resultados.
- No ofrece dashboard.
- No implementa inventario, ventas o cobranza.
- No implementa presupuestos ni Analista de Gastos.
- No envía resumen automático de las 9:00 pm.
- No corrige gastos publicados.
- No restaura un gasto cancelado.
- No implementa aprobación conversacional de solicitudes de cancelación por supervisor.
- No usa detección visual para fotografías distintas del mismo comprobante.
- No detecta duplicados generales en texto.
- No aprende responsable por comercio o frecuencia.
- No posee reglas probabilísticas de instrumentos.
- No guarda el documento original para consulta posterior.
- No existe endpoint de Evidence persistida.
- No soporta almacenamiento S3.
- No implementa reintentos, colas, DLQ o idempotencia distribuida.
- EventBus no sobrevive reinicios.
- El normalizador con IA futura no está implementado como dependencia necesaria; las reglas activas son determinísticas.
- La regla de gasolina superior a $10,000 es temporal y no configurable.
- Las credenciales de `TEST_DATABASE_URL` son inválidas; la suite de integración completa no debe declararse aprobada hasta repararlas, ejecutarla satisfactoriamente y documentar el resultado.
- PDF.js emite una advertencia de fuentes estándar durante una prueba sintética; extracción y renderizado funcionan.
- El CFDI real Cyberpuerta quedó en sesión esperando responsable porque el documento no lo identifica; el Expense aún no se registra hasta recibirlo.
