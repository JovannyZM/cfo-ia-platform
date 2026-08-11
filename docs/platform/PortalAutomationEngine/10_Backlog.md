# PAE v1.0 — Backlog y puertas de implementación

## Decisiones tomadas

1. PAE será neutral al dominio y no modificará entidades de consumidores.
2. Brain solicitará capabilities; nunca controlará el navegador.
3. El motor será determinístico y no inventará workflows.
4. Se diseñará una abstracción de navegador antes de seleccionar proveedor.
5. Plantillas serán declarativas, versionadas y sin código arbitrario.
6. Adapters se crearán solo para comportamiento no expresable en plantilla.
7. Cada job tendrá tenant, idempotency key, deadline y versiones fijadas.
8. Sesiones estarán aisladas y serán efímeras por defecto.
9. Credenciales se manejarán por referencias opacas mediante Secret Broker.
10. Cookies persistentes serán excepción cifrada y auditada.
11. Downloads pasarán por cuarentena, validación, checksum y storage abstracto.
12. `UNKNOWN_OUTCOME` será un estado de primera clase.
13. Reintentos posteriores a commit exigirán reconciliación.
14. CAPTCHA/MFA producirán intervención humana; no se evadirán.
15. El PAE podrá iniciar dentro del backend actual, preservando límites para aislarlo después.

## Riesgos detectados

- términos de uso o controles de portales pueden impedir automatización;
- fuga de credenciales/cookies entre tenants;
- SSRF y redirects a orígenes no autorizados;
- cambios visuales que produzcan falsos éxitos;
- duplicación de facturas, pagos o reservas;
- resultado desconocido tras submit;
- malware y contenido activo en descargas;
- CAPTCHA/MFA que hagan inviable un flujo desatendido;
- sesiones suspendidas con datos sensibles;
- costo operativo de navegadores y concurrencia;
- rate limiting, bloqueos de cuenta y reputación de IP;
- uso de automatización en dominios regulados sin revisión legal;
- templates demasiado poderosas que se conviertan en código no auditado;
- captura excesiva de screenshots, HTML o telemetría sensible;
- acoplamiento prematuro a un proveedor de navegador o storage.

## Contradicciones y tensiones abiertas

1. **“Cualquier portal” vs autorización real:** una arquitectura reusable no implica permiso para automatizar cada sitio.
2. **Motor genérico vs flujos certificados:** la reutilización debe ocurrir en infraestructura, no permitir workflows arbitrarios creados por usuarios.
3. **No usar Playwright vs necesitar navegador:** falta seleccionar un BrowserProvider; el diseño permanece agnóstico.
4. **Sesiones efímeras vs MFA/CAPTCHA:** una espera humana puede requerir suspensión y cookies cifradas.
5. **Reintentos vs efectos externos:** disponibilidad no puede priorizarse sobre evitar duplicados.
6. **Auditoría completa vs minimización:** se necesita evidencia suficiente sin almacenar secretos ni páginas completas.
7. **Storage abstracto vs downloads reales:** antes de producción debe existir un destino seguro y política de retención.
8. **PAE dentro del monolito vs aislamiento:** simplifica v1.0, pero banca/SAT pueden exigir separación de procesos y red.
9. **Invoice Assistant ya define `InvoicePortalAdapter`:** antes de implementar debe decidirse si ese contrato se reemplaza por una capability PAE o se convierte en una fachada del PAE, evitando dos capas de adapters con responsabilidades duplicadas. No se modifica ahora.
10. **CAPTCHA “soportado” vs no evadir controles:** soportar significa pausar y pedir intervención o pasar a proceso manual, no resolverlo automáticamente.

## Backlog antes del primer adapter

### P0 — decisiones bloqueantes

- aprobar modelo de amenazas y revisión legal/ToS del primer target;
- elegir alcance inicial de capabilities de solo lectura o commit;
- definir contratos puros de Job, Result, Error, Challenge y Artifact;
- definir persistencia de jobs, intentos, checkpoints e idempotencia;
- seleccionar Secret Manager y Artifact Storage;
- diseñar Human Challenge Gateway seguro;
- definir política de datos, retención y redacción;
- decidir reconciliación para resultado desconocido;
- resolver la frontera con `InvoicePortalAdapter` existente;
- seleccionar BrowserProvider mediante una prueba técnica aislada, no un adapter de comercio.

### P1 — plataforma mínima

- schemas versionados de plantilla y manifest;
- registries con firma/digest y promoción por entorno;
- allowlist de red y protección SSRF;
- session manager y cleanup attestable;
- download manager con cuarentena;
- state machine persistente;
- retry/circuit breaker;
- audit sink y métricas;
- kill switches;
- reloj inyectable y pruebas de timeout.

### P2 — validación

- portal sandbox o sitio de prueba controlado;
- pruebas de aislamiento multi-tenant;
- pruebas de secreto/logging;
- caos: proceso muerto, navegador perdido, red cortada y storage fallido;
- validación de unknown outcome y reconciliación;
- revisión de seguridad y threat modeling;
- runbook de incidente y rollback;
- SLO de disponibilidad, latencia y tasa de falso éxito.

### Fuera de v1.0

- creación de workflows por usuarios;
- ejecución autónoma basada en IA;
- evasión de CAPTCHA o antibot;
- manejo general de e.firma;
- transferencias bancarias o pagos automáticos;
- adapters de Costco/Chedraui;
- selección definitiva de tecnología de navegador;
- microservicio independiente sin justificación operativa.

## Recomendaciones antes de escribir el primer adapter

1. Elegir un portal de sandbox o un flujo propio sin efectos legales ni dinero.
2. Implementar primero contratos, state machine, aislamiento, secret broker y auditoría.
3. Probar `READ_ONLY` y descargas antes de habilitar `COMMIT`.
4. Definir evidencia positiva de éxito y reconciliación antes del primer submit.
5. Acordar quién atiende MFA/CAPTCHA y cuánto dura una sesión suspendida.
6. Resolver el solapamiento con Invoice Assistant sin modificar su dominio.
7. Realizar revisión legal, seguridad y privacidad por target.
8. Mantener cada capability pequeña: buscar, reservar y comprar no deben ser un único flujo.
9. Medir el proveedor de navegador con pruebas de carga y aislamiento antes de adoptarlo.
10. No declarar un adapter productivo hasta tener smoke tests manuales, kill switch y runbook.

