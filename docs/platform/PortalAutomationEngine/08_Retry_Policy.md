# PAE v1.0 — Política de reintentos

## Principio

Solo se reintenta cuando la operación es segura y el error es temporal. La política resulta de `capability + stage + error + externalEffectPossible + attempt`, no de un booleano devuelto por el adapter.

## Clases

### Seguro para reintento automático

- adquisición de recurso sin sesión creada;
- DNS o conexión temporal antes de enviar datos;
- HTTP 429/5xx antes de commit, respetando `Retry-After`;
- página no cargada antes de cualquier efecto;
- descarga fallida cuando el resultado externo ya está confirmado y existe recuperación segura.

### Requiere nueva autenticación o intervención

- sesión expirada;
- MFA/CAPTCHA;
- credencial bloqueada o revocada;
- consentimiento nuevo;
- rate limit prolongado.

### Nunca reintentar a ciegas

- submit de factura, pago, compra, reserva, cancelación o declaración;
- timeout después de commit;
- respuesta ambigua del portal;
- error de validación de negocio;
- ticket/folio ya procesado;
- cuenta bloqueada;
- `PORTAL_CHANGED` sin revisión.

## Algoritmo base

- Máximo global configurable por capability; recomendación inicial: 3 intentos totales antes de commit.
- Backoff exponencial con jitter.
- Respetar deadline global y `Retry-After`.
- Cada intento usa número creciente y auditoría propia.
- Preferir sesión nueva tras fallo de navegador; reutilizar sesión solo si el error y la política lo permiten.
- Circuit breaker por target/capability/version para fallos sistémicos.

No se fijan todavía segundos exactos: deben derivarse de mediciones y SLO por portal. Hardcodear una única política para bancos, SAT y comercio electrónico sería inseguro.

## Reconciliación

Después de un posible efecto externo, el siguiente intento solo puede ejecutar una capacidad de consulta/verificación. Si confirma éxito, normaliza `SUCCEEDED`; si confirma rechazo, permite fallo final o nuevo commit según política; si no puede determinarlo, permanece `UNKNOWN_OUTCOME`.

## Idempotencia

- Reutilizar el mismo `jobId` e `idempotencyKey` en intentos.
- No crear un segundo trabajo para “probar otra vez”.
- Verificar soporte de idempotencia del portal cuando exista.
- Si el portal no ofrece clave idempotente, usar consulta previa/posterior y referencias de negocio.

## Fallo del envío al consumidor

Un resultado PAE exitoso persiste antes de notificarse. Si falla la entrega interna, se reentrega el mismo resultado; no se repite el portal.

## Pruebas futuras

- backoff y jitter deterministas con reloj falso;
- respeto del deadline;
- 429 con `Retry-After`;
- 5xx antes de commit;
- timeout durante commit → `UNKNOWN_OUTCOME`;
- reinicio del proceso sin duplicación;
- circuit breaker;
- descarga recuperable;
- MFA y credenciales inválidas sin bucle;
- envío interno repetido sin nueva navegación.

