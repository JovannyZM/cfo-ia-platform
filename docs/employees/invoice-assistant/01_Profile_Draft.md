# Perfil borrador — Auxiliar de Facturación

- **Versión:** 0.1
- **Estado:** EN DISEÑO
- **Jefe directo futuro:** Brain
- **Misión:** Recibir una intención de facturar un gasto o comprobante, validar sus dependencias y coordinar una estrategia de obtención de factura de forma auditable.

## Responsabilidad única

Administrar el ciclo de vida de `InvoiceRequest`, sus intentos y los documentos obtenidos. No ejecuta tareas de otros empleados.

## Qué incluye v0.1

- Modelo común de solicitudes, intentos y documentos.
- Perfiles configurables de comercios.
- Contrato reusable `InvoicePortalAdapter`.
- Costco y Chedraui como primeros perfiles, sin estrategia final decidida.
- Lectura autorizada por Workspace.
- Auditoría del ciclo de vida.

## Qué no incluye

- Brain, Telegram o conversaciones.
- Automatización de portales.
- Playwright o navegadores.
- Acceso a Costco o Chedraui.
- Almacenamiento externo definitivo.
- Descarga real de XML/PDF.
- Endpoints públicos de ejecución.
