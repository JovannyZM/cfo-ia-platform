# PAE v1.0 — Manejo de errores

## Envelope normalizado

Todo fallo devuelve:

- `code`: código estable del PAE.
- `category`: familia del error.
- `stage`: validación, sesión, navegación, autenticación, captura, commit, verificación, descarga o cleanup.
- `retryable`: decisión calculada por política, no por adapter solamente.
- `externalEffectPossible`: indica riesgo de efecto externo.
- `safeMessage`: apto para consumidor y logs.
- `technicalReference`: correlación interna.
- `occurredAt`, `attemptNumber`, adapter/plantilla versionados.

No devuelve stack, secreto, cookies, HTML completo, contenido documental ni campos capturados.

## Categorías y códigos base

| Categoría | Ejemplos de código | Tratamiento |
|---|---|---|
| Input | `INPUT_INVALID`, `REQUIRED_FIELD_MISSING` | final; corregir en consumidor |
| Policy | `TARGET_DISABLED`, `CAPABILITY_DENIED`, `TERMS_REVIEW_REQUIRED` | final hasta cambio operativo |
| Auth | `AUTH_INVALID`, `AUTH_LOCKED`, `SESSION_EXPIRED` | intervención o reautenticación controlada |
| Human | `CAPTCHA_REQUIRED`, `MFA_REQUIRED`, `CONSENT_REQUIRED` | `WAITING_HUMAN` |
| Navigation | `DNS_FAILURE`, `TLS_FAILURE`, `PAGE_TIMEOUT`, `REDIRECT_BLOCKED` | retry según contexto |
| Portal | `PORTAL_UNAVAILABLE`, `PORTAL_CHANGED`, `RATE_LIMITED` | retry/circuit breaker o revisión |
| Business response | `RECORD_NOT_FOUND`, `ALREADY_PROCESSED`, `WINDOW_EXPIRED` | normalizar y devolver al consumidor |
| Commit | `COMMIT_REJECTED`, `COMMIT_TIMEOUT`, `OUTCOME_UNKNOWN` | verificar antes de repetir |
| Download | `DOWNLOAD_MISSING`, `TYPE_MISMATCH`, `MALWARE_DETECTED`, `SIZE_EXCEEDED` | final o retry seguro |
| Internal | `ADAPTER_BUG`, `TEMPLATE_INVALID`, `RESOURCE_EXHAUSTED` | fallo y alerta interna |

## Primer error versus causa raíz

El resultado conserva una causa primaria y una cadena sanitizada de causas técnicas. El error de cleanup no reemplaza al error que originó el fallo. Múltiples artifacts fallidos se reportan individualmente.

## Portal cambiado

Se considera `PORTAL_CHANGED` cuando faltan elementos esenciales, cambia una expectativa estructural, aparece un paso desconocido o el criterio de éxito ya no es verificable. Debe abrir el circuit breaker del target/version después de un umbral y detener commits, no “adivinar” selectores.

## Resultado desconocido

Si el timeout o corte ocurre después de enviar una acción potencialmente irreversible:

1. marcar `UNKNOWN_OUTCOME`;
2. conservar referencia y checkpoint seguro;
3. intentar únicamente verificación/reconciliación;
4. no repetir el commit automáticamente;
5. escalar a revisión humana si no puede determinarse el resultado.

## Sanitización

- Mapear mensajes conocidos mediante fingerprints o códigos, no copiarlos completos.
- Redactar RFC, correos, nombres, números de cuenta, tarjetas, folios sensibles y query strings.
- Stack traces solo en telemetry interna con acceso restringido y sanitización previa.
- Screenshots de error deshabilitados por defecto.

## Observabilidad

Métricas permitidas: latencia por etapa, tasas de éxito/error, retries, challenges, downloads, cambios de portal y sesiones perdidas. Las dimensiones no deben contener tenant names, URLs con parámetros, valores de formulario ni identificadores personales.

