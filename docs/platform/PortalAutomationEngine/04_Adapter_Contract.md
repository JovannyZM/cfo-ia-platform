# PAE v1.0 — Contrato de Adapter

## Propósito

Un adapter encapsula comportamiento técnico específico de un portal que no puede expresarse de forma segura en una plantilla. No contiene reglas financieras, fiscales, de viaje ni decisiones de Brain.

## Manifest obligatorio

- `adapterKey` y versión semántica.
- targets y capabilities soportadas.
- versiones de plantilla compatibles.
- dominios y redirects permitidos.
- tipos de credenciales solicitados.
- tipos de artifacts permitidos.
- modos soportados: `READ_ONLY`, `PREVIEW`, `COMMIT`.
- checkpoints y puntos de posible efecto externo.
- errores conocidos y clasificación inicial.
- requisitos de sesión, login, MFA o intervención humana.

## Operaciones conceptuales

```text
canHandle(context) -> boolean
validateInput(context, input) -> ValidationResult
prepare(context) -> PreparedSession
executeStep(context, step) -> StepResult
detectChallenge(context) -> HumanChallenge | null
detectOutcome(context) -> OutcomeEvidence
collectArtifacts(context) -> ArtifactCandidate[]
normalizeResult(context) -> PortalJobResult
cleanup(context) -> CleanupResult
```

No es una firma TypeScript definitiva; es el contrato conceptual que deberá convertirse en contratos puros antes del primer adapter.

## Contexto permitido

El adapter puede recibir navegador limitado, plantilla resuelta, datos de entrada minimizados, acceso mediado a secretos, download manager, reloj, logger redactado y señal de cancelación. No recibe repositorios de Expense, InvoiceRequest, Budget ni tablas del consumidor.

## Reglas

1. `canHandle` no hace I/O ni navega.
2. `validateInput` no consulta secretos.
3. Toda navegación usa el Browser Gateway; nunca HTTP o navegador directo no auditado.
4. Todo secreto se solicita al Secret Broker en el último momento.
5. El adapter no persiste cookies, archivos ni resultados por cuenta propia.
6. El adapter declara antes del commit que la siguiente acción puede tener efecto externo.
7. Un selector ausente no se interpreta como éxito.
8. El éxito requiere evidencia positiva declarada.
9. Los mensajes del portal se mapean a códigos normalizados y conservan un fingerprint diagnóstico, no contenido sensible.
10. `cleanup` se ejecuta incluso tras timeout o cancelación.

## Plantilla versus adapter

Una plantilla puede declarar: URL, campos, aliases, formato, secuencia de pasos, selectores estables, expectativas, documentos y errores conocidos. Un adapter se justifica por autenticación particular, widgets dinámicos, protocolo propietario, navegación condicional compleja o recuperación especial de artifacts.

No se crea un adapter solo porque cambió un selector; si el flujo sigue siendo declarativo, se versiona la plantilla.

## Compatibilidad y cambios

- Un job fija versión de adapter y plantilla.
- Cambios incompatibles requieren versión mayor.
- Una versión retirada no acepta trabajos nuevos, pero conserva trazabilidad histórica.
- Canary y smoke test preceden la promoción.
- El adapter debe poder deshabilitarse con kill switch.

## Pruebas mínimas futuras

- contrato y schema del manifest;
- navegación solo a allowlist;
- redacción de secretos;
- timeout/cancelación/cleanup;
- detección de challenge;
- éxito positivo y falso positivo;
- error conocido y desconocido;
- descarga válida, inválida y sobredimensionada;
- `UNKNOWN_OUTCOME` alrededor del commit;
- compatibilidad de plantilla;
- prohibición de dependencias del dominio consumidor.

