# Portal Automation Engine v1.0 — Arquitectura

Estado: DISEÑO  
Fecha: 2026-08-05  
Alcance: documentación técnica. No existe implementación, navegador, adapter ni automatización de Costco.

## Misión

El Portal Automation Engine (PAE) ejecuta procesos previamente certificados sobre portales web. No decide objetivos de negocio, no inventa workflows y no interpreta políticas financieras. Recibe un trabajo explícito, selecciona una definición aprobada, coordina una sesión de navegador aislada, produce evidencias técnicas y devuelve un resultado normalizado.

## Principios

1. El PAE ejecuta; Brain decide cuándo solicitar una capacidad.
2. Cada producto conserva su lógica de negocio. El PAE desconoce facturas, vuelos o bancos salvo por contratos genéricos.
3. Ningún flujo se improvisa en producción. Plantillas y adapters deben estar versionados, aprobados y probados.
4. El navegador es un recurso efímero y hostil: toda salida debe validarse.
5. Una sesión pertenece a un Workspace, un trabajo y una identidad técnica.
6. Credenciales, cookies y documentos nunca viajan por logs ni eventos de dominio.
7. CAPTCHA, MFA, consentimiento y bloqueos antifraude producen intervención humana; no se eluden.
8. Reintentar no equivale a repetir ciegamente una operación con efectos externos.

## Vista de componentes

```text
Brain / Servicio consumidor
          |
          | PortalJobRequest
          v
     PAE Facade/API
          |
          v
  Policy & Capability Resolver ---- Template Registry
          |                              |
          v                              v
     Job Orchestrator ------------ Adapter Registry
          |
          +---- Secret Broker
          +---- Session Manager
          +---- Browser Provider
          +---- Download Manager
          +---- Retry & Timeout Policy
          +---- Human Challenge Gateway
          +---- Audit/Telemetry Sink
          |
          v
  Result Normalizer / Artifact Manifest
          |
          v
 PortalJobResult / Domain-specific consumer
```

## Contratos principales

### PortalJobRequest

- `jobId`: identificador idempotente asignado por el consumidor.
- `workspaceId`: frontera obligatoria de tenant.
- `capabilityKey`: acción certificada, por ejemplo `INVOICE_ISSUE` o `FLIGHT_SEARCH`.
- `targetKey`: portal o proveedor lógico.
- `templateVersion`: versión aprobada; no usar siempre “latest” en producción.
- `input`: datos ya validados por el consumidor.
- `credentialReference`: referencia opaca; nunca secreto en claro.
- `requestedBy`: actor humano o sistema.
- `correlationId` y `causationId`.
- `deadlineAt`: límite total del trabajo.
- `idempotencyKey`: clave de negocio suministrada por el consumidor.

### PortalJobResult

- `jobId`, `status`, `startedAt`, `finishedAt`.
- `output`: resultado normalizado según la capacidad.
- `artifacts`: manifiesto de descargas, sin bytes embebidos.
- `externalReferences`: folios o identificadores del portal.
- `error`: código sanitizado, etapa, retryability y mensaje seguro.
- `auditReference` y métricas no sensibles.

## Responsabilidades

### PAE Facade

Valida el envelope, autorización técnica, idempotencia, capacidad permitida y versión. No valida reglas fiscales, bancarias o comerciales del producto consumidor.

### Policy & Capability Resolver

Determina si el Workspace, entorno y target pueden ejecutar la capacidad; aplica allowlists de dominios, horarios, regiones, versiones y modo `READ_ONLY`, `PREVIEW` o `COMMIT`.

### Job Orchestrator

Controla la máquina de estados, checkpoints, timeouts, intentos y compensaciones permitidas. Es el único que inicia o termina sesiones.

### Template Registry

Entrega definiciones declarativas versionadas y firmadas. Una plantilla no ejecuta código arbitrario.

### Adapter Registry

Resuelve código específico revisado para un target/capacidad. Los adapters no se registran dinámicamente desde entradas de usuario.

### Browser Provider y Session Manager

Crean contextos aislados, aplican límites, navegan solo a dominios autorizados y destruyen el estado efímero al terminar.

### Secret Broker

Entrega secretos de corta duración al componente que los necesita. El orquestador recibe referencias, no valores.

### Download Manager

Intercepta, valida, escanea, calcula checksum y entrega referencias a artifacts. Nunca interpreta el significado de negocio.

### Audit/Telemetry Sink

Registra quién solicitó, qué plantilla/adapter se ejecutó, transiciones, resultado y hashes; excluye secretos, contenido de formularios y documentos completos.

## Conexión con Brain

Brain no controla páginas ni conoce selectores. Decide invocar una capacidad certificada y publica o solicita un `PortalJobRequest`. Recibe un resultado técnico y lo entrega al Worker o servicio dueño del proceso. Un cambio visual del portal no obliga a cambiar Brain.

El PAE no debe publicar directamente eventos financieros, fiscales o de viajes. Devuelve un resultado; el consumidor decide qué evento de dominio emitir.

## Conexión con Invoice Assistant

Invoice Assistant conserva `InvoiceRequest`, validación de TaxProfile, estados fiscales, intentos, documentos y auditoría de negocio. Cuando una estrategia requiera portal:

1. Invoice Assistant crea y valida la solicitud.
2. Construye un trabajo PAE con datos mínimos y referencias seguras.
3. PAE ejecuta la capacidad `INVOICE_ISSUE`.
4. PAE devuelve XML/PDF, referencias externas o error normalizado.
5. Invoice Assistant interpreta el resultado, crea `InvoiceDocument` y cambia su propio estado.

PAE no consulta ni modifica directamente tablas de Invoice Assistant.

## Extensión a otros proyectos

| Proyecto | Capacidad PAE | Responsabilidad que permanece fuera |
|---|---|---|
| Vuelos | buscar disponibilidad, reservar bajo confirmación | preferencias, presupuesto, aprobación de compra |
| Hoteles | consultar, reservar, recuperar confirmación | política de viaje y selección final |
| Descuentos | consultar promociones o aplicar cupón autorizado | elegibilidad comercial y decisión de uso |
| SAT | consultar/descargar trámites permitidos | interpretación fiscal y cumplimiento |
| Bancos | consultar saldos/movimientos permitidos | conciliación, pagos y control financiero |
| Boletos | buscar, apartar o comprar con aprobación | elección del evento y autorización de gasto |
| Inventarios | consultar/capturar en portales autorizados | política de inventario y valuación |

Las capacidades con dinero, declaraciones, cancelaciones, firma o efectos legales requieren modo de confirmación explícita y políticas reforzadas.

## Fronteras Motor / Plantilla / Adapter

### Motor

Máquina de estados, aislamiento, navegador, secretos, cookies, descargas, auditoría, timeouts, retry, idempotencia, intervención humana, validación de dominios, normalización técnica y observabilidad.

### Plantilla

Pasos declarativos aprobados, campos, formatos, URLs permitidas, expectativas de página, documentos esperados, timeouts específicos dentro de límites, códigos conocidos y reglas de extracción no ejecutables.

### Adapter

Comportamiento específico imposible de expresar de forma segura en una plantilla: autenticación particular, protocolo propietario, controles dinámicos, navegación compleja y normalización específica. Nunca políticas del negocio consumidor.

## Despliegue recomendado

PAE debe ser un módulo/plataforma aislable, con contratos independientes de NestJS y del navegador concreto. En v1.0 puede desplegarse dentro del mismo backend para reducir operación, pero debe conservar límites que permitan separarlo cuando la carga, seguridad o aislamiento lo exijan. No se recomienda iniciar como microservicio sin necesidad operativa demostrada.

