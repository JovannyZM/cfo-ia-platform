# Primera sonda técnica PAE — Costco

Fecha: 2026-08-05  
Adapter: `COSTCO_INVOICE_READ_ONLY`  
Capability: `INVOICE_PORTAL_READ_ONLY_PROBE`  
PortalSession validada: `766743be-7c02-4d98-8235-ac91dec95004`

## Objetivo

Validar que el Portal Automation Engine puede crear una sesión aislada, abrir un portal real, aplicar una allowlist de navegación, inspeccionar metadatos y elementos visibles, tomar una captura temporal, cerrar el navegador y persistir auditoría técnica.

## Límites aplicados

- No se capturaron valores en formularios.
- No se hizo clic en `Continuar`, `Facturación`, `Enviar` ni controles equivalentes.
- No se solicitó ni generó factura.
- No se usaron datos fiscales, credenciales, tickets u órdenes reales.
- No se descargaron XML ni PDF.
- No se modificaron `InvoiceRequest`, `Expense` ni módulos del Auxiliar de Gastos.
- Tiempo máximo: 60 segundos.
- Máximo: un reintento de navegación.
- Kill switch habilitado solo para la ejecución manual.
- Captura guardada temporalmente en `.pae-artifacts`, excluida de Git.

## Resultado real

```json
{
  "success": true,
  "adapterKey": "COSTCO_INVOICE_READ_ONLY",
  "finalUrl": "https://www3.costco.com.mx/facturacion",
  "pageTitle": "Costco México",
  "visibleFields": [
    { "name": "ticket", "label": "Ticket / Orden", "type": "text" },
    { "name": "monto", "label": "Total pagado", "type": "text" },
    { "name": "rfc", "label": "RFC", "type": "text" }
  ],
  "captchaDetected": false,
  "loginDetected": true,
  "warnings": [
    "Third-party domains were blocked: cdnjs.cloudflare.com, storage.googleapis.com, www.googletagmanager.com",
    "Login controls were detected"
  ]
}
```

`loginDetected=true` significa que la página contiene el acceso general “Iniciar Sesión”; no demuestra que sea obligatorio iniciar sesión para usar el formulario de facturación.

## Botones y controles observados

Controles principales del flujo:

- `Borrar`.
- `Continuar`.
- pestañas `Generación` y `Reenvío`.

También se observaron navegación general y preguntas frecuentes. La sonda solo leyó sus textos; no activó ninguno.

## Dominios observados

### Permitidos por la política Costco

- `www3.costco.com.mx`: documento principal.
- `services3.costco.com.mx`: servicio solicitado por la página; permitido por pertenecer a `costco.com.mx`.

### Detectados y bloqueados

- `cdnjs.cloudflare.com`.
- `storage.googleapis.com`.
- `www.googletagmanager.com`.

La página siguió mostrando el formulario principal pese al bloqueo. Ningún dominio de terceros debe agregarse a la allowlist sin revisar propósito, necesidad, privacidad y riesgo. Google Tag Manager no es necesario para el objetivo funcional conocido y debe permanecer bloqueado.

## CAPTCHA y login

- CAPTCHA visible: no detectado.
- Código de seguridad visible: no detectado.
- Login visible: sí, como navegación general de Costco.
- Login requerido para continuar: no verificado porque la sonda no envió el formulario.

## Mensajes legales y restricciones observados

- Las compras no facturadas se consideran operaciones con público en general al cierre del ejercicio fiscal y posteriormente no puede expedirse un comprobante nominativo.
- Costco publica teléfonos de Atención a Socios y una opción específica de facturación.
- El portal incluye preguntas sobre tiempo para facturar, CFDI 4.0, reenvío, consulta, IEPS, RFC genérico y cancelación.

La sonda no desplegó las respuestas de las preguntas frecuentes porque hacerlo habría implicado interacción adicional fuera del objetivo mínimo.

## Auditoría

Para la PortalSession se diseñaron y ejecutaron los eventos:

- `PORTAL_SESSION_CREATED`.
- `PORTAL_NAVIGATION_STARTED`.
- `PORTAL_NAVIGATION_COMPLETED`.
- `PORTAL_SCREENSHOT_CAPTURED`.
- `PORTAL_SESSION_COMPLETED`.

La auditoría conserva adapter, capability, estado y URL sanitizada. No conserva cookies, HTML, imágenes, valores de campos ni secretos. En fallo se registra `PORTAL_SESSION_FAILED` con código y mensaje sanitizado.

## Riesgos confirmados

1. El portal consume recursos de terceros; una allowlist excesiva ampliaría la superficie de red.
2. La primera carga observada durante el desarrollo fue parcialmente vacía; el portal necesita espera de estabilización y puede responder de forma variable.
3. El control `Continuar` puede revelar validaciones, CAPTCHA, login o dominios adicionales que esta sonda deliberadamente no evaluó.
4. La detección de login basada en contenido indica presencia, no obligatoriedad.
5. Una captura técnica puede contener PII cuando se use una sesión con datos; debe permanecer deshabilitada o redactada en futuras fases transaccionales.
6. La autorización contractual para automatizar el portal sigue pendiente.

## Decisión sobre el siguiente paso

La capacidad básica del PAE quedó probada para navegación read-only, aislamiento, inspección, screenshot temporal, cierre y persistencia. **No está autorizado comenzar un adapter transaccional.** Antes se requiere:

1. revisión legal y de términos de uso de Costco;
2. clasificación y aprobación explícita de cada dominio externo necesario;
3. una prueba manual controlada del botón `Continuar` con datos sintéticos o autorizados;
4. confirmar validaciones, CAPTCHA/login y criterio positivo de éxito;
5. definir reconciliación e idempotencia antes de cualquier emisión;
6. definir almacenamiento definitivo y seguro de XML/PDF;
7. habilitar screenshots solo con política de redacción y retención.

