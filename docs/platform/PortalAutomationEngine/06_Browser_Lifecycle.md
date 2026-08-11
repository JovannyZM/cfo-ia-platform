# PAE v1.0 — Ciclo de vida del navegador

## Abstracción

El PAE depende de un `BrowserProvider` abstracto. v1.0 no elige Playwright ni otro proveedor. El contrato debe permitir cambiar la tecnología sin alterar Brain, consumidores, plantillas o adapters.

## Ciclo de sesión

1. **Allocate**: reservar capacidad con límites de CPU, memoria y duración.
2. **Create context**: contexto aislado por Workspace, identidad y job.
3. **Apply policy**: allowlist, proxy autorizado, locale, timezone, user agent aprobado, límites de red y descarga.
4. **Hydrate**: cargar cookies cifradas solo si existe una política explícita de reanudación.
5. **Navigate**: abrir URL inicial declarada y verificar origen/TLS.
6. **Operate**: ejecutar pasos con deadlines y cancellation signal.
7. **Suspend**: opcional, solo para challenge humano; cerrar o congelar recursos conforme al TTL.
8. **Resume**: validar que job, identidad, challenge y cookies sigan vigentes.
9. **Release**: cerrar páginas/contexto y borrar memoria temporal.
10. **Attest cleanup**: registrar que recursos y estado efímero fueron destruidos.

## Aislamiento

- Un contexto por job; múltiples páginas solo si la plantilla lo declara.
- No compartir cache, localStorage, IndexedDB, service workers ni clipboard.
- Descargas van al Download Manager, no al filesystem general del host.
- Bloquear permisos de cámara, micrófono, geolocalización, notificaciones y USB salvo capacidad aprobada.
- Prohibir extensiones y perfiles personales del navegador.

## Timeouts

| Nivel | Propósito |
|---|---|
| Job deadline | límite absoluto de toda la operación |
| Session TTL | vida máxima del contexto, incluida espera humana |
| Navigation timeout | DNS/TLS/carga inicial |
| Step timeout | acción o expectativa individual |
| Idle timeout | ausencia de progreso observable |
| Download timeout | inicio y finalización de artifact |
| Human challenge TTL | ventana para MFA/CAPTCHA/consentimiento |
| Cleanup timeout | cierre forzado y attestación |

El timeout menor prevalece. Una plantilla puede reducir, pero no ampliar los máximos de plataforma.

## Cancelación

La cancelación es cooperativa antes de `COMMITTING`. Durante commit/verificación, se prioriza determinar el resultado. El navegador recibe una señal de cancelación, deja de iniciar pasos, conserva auditoría mínima y ejecuta cleanup.

## Reinicios y recuperación

- Un navegador perdido marca la sesión `LOST`.
- El trabajo vuelve a `FAILED_RETRYABLE` solo si no hubo posible efecto externo.
- Si hubo submit, pasa a `UNKNOWN_OUTCOME` y exige reconciliación.
- Reiniciar API no debe reusar perfiles locales ni duplicar jobs.

## Cookies persistentes

No son el comportamiento predeterminado. Cuando una integración las requiera:

- cifrado con clave administrada;
- vínculo a Workspace/target/identity/environment;
- TTL y revocación;
- validación antes de reanudar;
- destrucción al revocar credenciales;
- auditoría sin exponer valores.

## Capturas y video

Deshabilitados por defecto. Para diagnóstico controlado deben tener consentimiento/política, redacción, TTL corto y acceso restringido. Nunca capturar durante ingreso de contraseña, MFA, e.firma o datos de pago.

