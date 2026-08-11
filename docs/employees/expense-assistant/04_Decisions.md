# Decisiones

## 1. Workers puros sin EventBus

- **Fecha:** 2026-07-29
- **Motivo:** Mantener responsabilidad única y pruebas aisladas.
- **Alternativas evaluadas:** Worker publicando directamente; orquestación central.
- **Por qué se eligió:** Brain debe ser el único publicador.
- **Impacto:** Menor acoplamiento y trazabilidad causal uniforme.

## 2. Ejecución secuencial de Workers

- **Fecha:** 2026-07-29
- **Motivo:** Orden determinístico.
- **Alternativas:** Paralelismo.
- **Elección:** Orden de registro.
- **Impacto:** Un fallo detiene el proceso sin publicar resultados parciales del Worker fallido.

## 3. EventBus exclusivamente en memoria

- **Fecha:** 2026-07-29
- **Motivo:** Infraestructura MVP sin operación distribuida.
- **Alternativas:** Kafka, RabbitMQ, Redis.
- **Elección:** Bus local asíncrono.
- **Impacto:** Simplicidad; no hay durabilidad de eventos.

## 4. Brain no conoce Workers específicos

- **Fecha:** 2026-07-29
- **Motivo:** Extensibilidad por registro.
- **Alternativas:** `switch` o rutas por Worker.
- **Elección:** `WorkerRegistry`.
- **Impacto:** Nuevos empleados no requieren reglas específicas en Brain.

## 5. Imagen efímera

- **Fecha:** 2026-07-30
- **Motivo:** Simplificar el MVP y vender antes.
- **Alternativas:** S3 compatible, PostgreSQL/base64, sistema de archivos.
- **Elección:** Evidencia solo en memoria.
- **Impacto:** Menos infraestructura; no existe archivo histórico.

## 6. OpenAI mediante SDK oficial y Responses API

- **Fecha:** 2026-07-30
- **Motivo:** Multimodalidad y salida estructurada.
- **Alternativas:** Integración propietaria o parsing narrativo.
- **Elección:** Modelo configurable, Zod y timeout.
- **Impacto:** Contrato verificable y proveedor aislado detrás de una interfaz.

## 7. Fakes obligatorios en automatización

- **Fecha:** 2026-07-30
- **Motivo:** Determinismo, costo y ausencia de secretos.
- **Alternativas:** Llamadas reales en CI.
- **Elección:** `FakeExpenseEvidenceInterpreter`.
- **Impacto:** Tests sin costo; lectura real se valida manualmente.

## 8. Telegram como adaptador, no como dominio

- **Fecha:** 2026-07-31
- **Motivo:** Reutilizar el mismo endpoint.
- **Alternativas:** Lógica financiera dentro del bot.
- **Elección:** Transporte delgado.
- **Impacto:** Web, WhatsApp o voz podrán compartir el núcleo.

## 9. Instrumento como entidad propia

- **Fecha:** 2026-08-04
- **Motivo:** Aprender titular de una tarjeta de forma explícita.
- **Alternativas:** Responsable global o asociación por comercio.
- **Elección:** `workspaceId + type + last4`.
- **Impacto:** Aprendizaje determinístico y reutilizable.

## 10. Sesión conversacional persistente y genérica

- **Fecha:** 2026-08-04
- **Motivo:** El contexto en memoria se perdía y las intenciones caían a gasto nuevo.
- **Alternativas:** Estado en Telegram o memoria del proceso.
- **Elección:** `ConversationSession` en PostgreSQL.
- **Impacto:** Continuidad tras reinicios y una sola intención activa.

## 11. Política de no corrección

- **Fecha:** 2026-08-04
- **Motivo:** Trazabilidad de documentos publicados.
- **Alternativas:** `UPDATE` con `USER_CORRECTION`.
- **Elección:** Cancelar y registrar de nuevo.
- **Impacto:** Historial intacto y menos ambigüedad operativa.

## 12. Cancelación lógica y jerárquica

- **Fecha:** 2026-08-04
- **Motivo:** Evitar borrado y acciones no autorizadas.
- **Alternativas:** Borrado físico o cancelación libre.
- **Elección:** Estado `CANCELLED`, motivo y autorización.
- **Impacto:** Conservación fiscal y auditoría completa.

## 13. Selección segura para cancelación ambigua

- **Fecha:** 2026-08-04
- **Motivo:** La búsqueda por lenguaje no localizaba siempre el gasto real.
- **Alternativas:** Más sinónimos o coincidencia difusa.
- **Elección:** Lista numerada con IDs persistidos.
- **Impacto:** Nunca se cancela por ambigüedad.

## 14. Un gasto por mensaje en v1.0

- **Fecha:** 2026-08-04
- **Motivo:** Mantener el alcance controlado.
- **Alternativas:** Separar múltiples gastos.
- **Elección:** Una entrada, un gasto.
- **Impacto:** Parser y conversaciones más seguros.

## 15. Anomalía de gasolina aislada

- **Fecha:** 2026-08-04
- **Motivo:** Confirmar importes claramente inusuales sin construir un motor completo.
- **Alternativas:** Registrar directamente o crear configuración general.
- **Elección:** Regla temporal mayor a $10,000.
- **Impacto:** Política reemplazable y sin falsas altas inmediatas.

## 16. Duplicado exacto por SHA-256

- **Fecha:** 2026-08-04
- **Motivo:** La misma foto podía crear dos gastos y duplicar llamadas.
- **Alternativas:** Guardar imagen o detección visual.
- **Elección:** Huella de bytes por Workspace.
- **Impacto:** Cero persistencia binaria y deduplicación exacta.

## 17. PDF de una sola página

- **Fecha:** 2026-08-04
- **Motivo:** Un PDF equivale a un comprobante en v1.0.
- **Alternativas:** Multipágina y clasificación documental.
- **Elección:** Rechazo explícito de más de una página.
- **Impacto:** Alcance predecible.

## 18. Dos rutas internas de PDF, un solo resultado

- **Fecha:** 2026-08-04
- **Motivo:** Facturas digitales y tickets escaneados requieren lectura distinta.
- **Alternativas:** Enviar siempre PDF completo o convertir siempre a imagen.
- **Elección:** Texto seleccionable o renderizado en memoria.
- **Impacto:** Mejor calidad y reutilización total del flujo.

## 19. Reglas explícitas de CFDI

- **Fecha:** 2026-08-04
- **Motivo:** Receptor puede aparecer antes que emisor.
- **Alternativas:** Depender del orden visual.
- **Elección:** Semántica de etiquetas CFDI en todo el texto.
- **Impacto:** Emisor, total, fecha, forma de pago y serie/folio correctos.

## 20. No iniciar todavía el Analista de Gastos

- **Fecha:** 2026-08-04
- **Motivo:** Cerrar al 100 % el Auxiliar antes de abrir otro empleado.
- **Alternativas:** Desarrollar empleados en paralelo.
- **Elección:** Pausar Analista, presupuestos y automatización.
- **Impacto:** Menor costo de oportunidad y foco en graduación.

