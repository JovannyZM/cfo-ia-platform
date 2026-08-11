# PAE v1.0 — Seguridad

## Modelo de amenazas

El PAE procesa credenciales, sesiones autenticadas, información fiscal, descargas y páginas controladas por terceros. Se consideran amenazas: fuga entre tenants, robo de sesión, SSRF, navegación a dominios maliciosos, prompt/instruction injection desde páginas, exfiltración por logs, archivos maliciosos, abuso de adapters, replay de acciones, automatización no autorizada y efectos externos duplicados.

## Frontera de tenant

- Toda operación exige `workspaceId` autenticado y autorizado.
- Sesiones, cookies, secretos, artifacts e idempotency keys están particionados por Workspace.
- No se reutilizan contextos de navegador entre Workspaces ni identidades.
- Las consultas administrativas no conceden permiso operacional sobre portales.

## Credenciales

- El PAE recibe `credentialReference`, nunca usuario/contraseña en el job.
- Los secretos viven en un secret manager; cifrado en reposo y tránsito.
- Acceso con privilegio mínimo, TTL corto y auditoría.
- El adapter solicita solo los campos declarados en su manifest.
- Nunca registrar valores, longitud, prefijos, capturas ni errores que los reproduzcan.
- Rotación y revocación no requieren cambiar plantillas.
- Credenciales bancarias, e.firma, certificados y llaves privadas requieren políticas específicas; no están aprobadas por defecto en v1.0.

## Cookies y sesión

- Cookie jar aislado por trabajo/identidad.
- Cookies cifradas si una espera humana exige persistencia; de otro modo, solo memoria.
- Respetar `Secure`, `HttpOnly`, `SameSite`, dominio y expiración.
- No exportar cookies a consumers, auditoría o soporte.
- Destruir cookies al terminar, salvo política explícita de sesión reutilizable aprobada.
- La reutilización nunca cruza Workspace, target, identidad o entorno.

## Navegación segura

- Allowlist exacta de esquemas HTTPS, hosts y redirects por target.
- Bloquear `file:`, `data:`, loopback, metadata cloud, redes privadas y puertos no autorizados.
- Limitar popups, nuevas pestañas, WebSockets y descargas a orígenes declarados.
- No ejecutar scripts suministrados por usuario o plantilla.
- El contenido de una página es dato no confiable; jamás redefine políticas del motor.

## Datos y logs

- Minimización: enviar al portal solo campos requeridos.
- Clasificar campos como público, interno, personal, fiscal, financiero o secreto.
- Redactar PII y secretos antes de logs y trazas.
- No guardar HTML, screenshots o video por defecto.
- Evidencia visual solo bajo política, con redacción, retención y acceso restringido.
- Los artifacts no se incluyen en eventos; se usan referencias y checksums.

## Descargas

- Cuarentena antes de entregar.
- Validar MIME real, firma mágica, extensión, tamaño y checksum.
- Analizar malware cuando la infraestructura lo permita.
- Bloquear ejecutables, archivos con macros y formatos no declarados.
- XML se procesa con entidades externas deshabilitadas.
- PDF se trata como contenido no confiable.

## Acciones sensibles

Acciones con dinero, firma, declaración, cancelación, compra o cambio irreversible exigen:

- capability explícitamente habilitada;
- actor y autorización de negocio suministrados por el consumidor;
- vista previa o confirmación cuando aplique;
- idempotency key;
- checkpoint previo al commit;
- verificación posterior;
- tratamiento `UNKNOWN_OUTCOME` si no hay certeza.

## CAPTCHA, MFA y controles humanos

- No resolver, comprar resolución, tercerizar ni evadir CAPTCHA automáticamente.
- MFA solo mediante un Human Challenge Gateway aprobado.
- El token humano se vincula a job, sesión, challenge y expiración.
- Nunca solicitar que el usuario comparta contraseña, semilla TOTP o códigos de recuperación.
- Si los términos prohíben automatización, se deshabilita el target o se usa proceso manual/autorizado.

## Supply chain y cambios

- Adapters firmados, revisados y versionados.
- Plantillas con esquema validado y firma/digest.
- Dependencias fijadas y escaneadas.
- Kill switch por target, adapter y versión.
- Separación de entornos y credenciales de prueba/producción.

## Retención y respuesta a incidentes

- Política explícita para logs, artifacts, cookies suspendidas y evidencias.
- Revocación inmediata de sesiones/credenciales afectadas.
- Capacidad de detener un target sin desplegar toda la plataforma.
- Audit trail inmutable de accesos y cambios de configuración.
- Nunca borrar auditoría por una cancelación funcional.

