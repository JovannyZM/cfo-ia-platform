# PAE v1.0 — Máquina de estados

## Estados del trabajo

| Estado | Significado |
|---|---|
| `CREATED` | Envelope aceptado, todavía sin evaluación |
| `VALIDATING` | Validación de tenant, capacidad, plantilla, input e idempotencia |
| `READY` | Trabajo válido y habilitado para ejecución |
| `ACQUIRING_SESSION` | Adquisición de navegador, secretos y contexto aislado |
| `RUNNING` | Ejecución activa de pasos sin efecto final confirmado |
| `WAITING_HUMAN` | Espera CAPTCHA, MFA, consentimiento o confirmación permitida |
| `COMMITTING` | Acción con efecto externo solicitada; no debe reintentarse a ciegas |
| `VERIFYING` | Verificación posterior del resultado externo |
| `DOWNLOADING` | Recepción y validación de artifacts |
| `SUCCEEDED` | Resultado confirmado y normalizado |
| `FAILED_RETRYABLE` | Fallo clasificado que admite reintento controlado |
| `FAILED_FINAL` | Fallo no reintentable o intentos agotados |
| `CANCELLED` | Cancelación aceptada antes de un punto irreversible |
| `EXPIRED` | Se venció el deadline global |
| `UNKNOWN_OUTCOME` | Hubo posible efecto externo, pero no pudo confirmarse |

`UNKNOWN_OUTCOME` es obligatorio: evita repetir pagos, emisiones, reservas o trámites cuando la respuesta se pierde después del submit.

## Flujo principal

```text
CREATED -> VALIDATING -> READY -> ACQUIRING_SESSION -> RUNNING
RUNNING -> WAITING_HUMAN -> RUNNING
RUNNING -> COMMITTING -> VERIFYING -> DOWNLOADING -> SUCCEEDED
VERIFYING -> SUCCEEDED

cualquier estado reversible -> FAILED_RETRYABLE -> READY
cualquier estado -> FAILED_FINAL | EXPIRED
antes de COMMITTING -> CANCELLED
COMMITTING/VERIFYING -> UNKNOWN_OUTCOME cuando no puede probarse el resultado
```

## Estados de sesión

- `ALLOCATING`: reservando recursos.
- `ACTIVE`: contexto disponible.
- `SUSPENDED`: espera humana con almacenamiento cifrado y TTL.
- `RELEASING`: cierre, limpieza y persistencia mínima autorizada.
- `RELEASED`: recursos destruidos.
- `LOST`: navegador o proceso desapareció sin cierre normal.

El estado del trabajo y el de sesión son distintos. Un trabajo puede reintentarse en una sesión nueva; una sesión nunca se reutiliza entre Workspaces.

## Checkpoints

Cada checkpoint contiene únicamente:

- paso y versión de plantilla;
- URL/origen sanitizado;
- estado lógico alcanzado;
- referencias opacas de sesión;
- hashes de inputs/outputs permitidos;
- evidencia técnica mínima;
- indicador `externalEffectPossible`.

No contiene contraseñas, cookies en claro, campos fiscales completos, PAN, documentos ni HTML íntegro.

## Transiciones protegidas

- Solo el orquestador cambia estados.
- `COMMITTING` requiere política de autorización satisfecha.
- `SUCCEEDED` requiere criterio de éxito positivo, no solo HTTP 200 o ausencia de excepción.
- Desde `UNKNOWN_OUTCOME` solo una reconciliación puede llegar a `SUCCEEDED` o `FAILED_FINAL`.
- `CANCELLED` no implica deshacer un efecto externo ya confirmado.
- `WAITING_HUMAN` debe tener `expiresAt` y una razón tipada.
- Estados terminales son inmutables, salvo anotaciones de auditoría o reconciliación de `UNKNOWN_OUTCOME`.

## Idempotencia

La clave efectiva combina `workspaceId + capabilityKey + targetKey + idempotencyKey`. Un trabajo terminal exitoso devuelve su resultado existente. Un trabajo activo no inicia otra sesión. Un fallo reintentable crea un intento nuevo dentro del mismo trabajo.

La idempotencia técnica no garantiza idempotencia del portal. Antes de repetir un commit debe consultarse o reconciliarse el estado externo.

