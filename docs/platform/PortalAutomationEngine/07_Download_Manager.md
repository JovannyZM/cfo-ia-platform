# PAE v1.0 — Download Manager

## Misión

Recibir artifacts producidos por un portal sin exponer el sistema de archivos, validar que corresponden al contrato y entregar un manifiesto seguro al consumidor. No interpreta si una factura, boleto o estado de cuenta es correcto desde el punto de vista de negocio.

## Flujo

1. El adapter declara una descarga esperada antes de iniciarla.
2. Browser Gateway intercepta el evento y transmite bytes a cuarentena.
3. Download Manager aplica límite de tamaño y timeout durante streaming.
4. Calcula SHA-256 mientras recibe; no requiere una segunda copia.
5. Valida firma mágica, MIME real, extensión y tipo esperado.
6. Ejecuta análisis de seguridad configurado.
7. Extrae solo metadatos técnicos permitidos.
8. Envía bytes a un `ArtifactStorage` abstracto.
9. Devuelve `storageReference`, checksum, tamaño, MIME y nombre sanitizado.
10. Elimina buffers y cuarentena aun cuando falle.

## Artifact manifest

- `artifactId`.
- `jobId` y `workspaceId`.
- `artifactType` definido por capability.
- `originalFileName` sanitizado y nombre canónico.
- `mediaType`, `size`, `sha256`.
- `storageReference` opaca.
- `sourceUrlOrigin` sin query string.
- `createdAt`.
- `validationStatus` y `securityScanStatus`.

No contiene base64 ni URL pública.

## Políticas

- Allowlist de tipos y tamaño por capability/template dentro de máximos globales.
- Un `Content-Type` declarado por el servidor no es suficiente.
- XML: DTD y entidades externas deshabilitadas; límites de profundidad/tamaño.
- PDF: validar estructura, cifrado, número de páginas si la capacidad lo exige y contenido activo.
- ZIP: bloqueado por defecto; si se habilita, prevenir zip bomb y path traversal.
- HTML, scripts y ejecutables: bloqueados salvo caso explícito y aislado.
- Nombres nunca controlan rutas físicas.

## Duplicados y correlación

El checksum detecta bytes idénticos dentro del alcance definido, pero no prueba equivalencia semántica. Múltiples descargas del mismo archivo pueden referenciar un artifact existente sin perder el vínculo de auditoría con cada intento.

## Fallos

- descarga no iniciada o incompleta;
- tamaño excedido;
- MIME/firma incompatible;
- checksum no verificable;
- archivo vacío o corrupto;
- malware o contenido activo prohibido;
- storage no disponible;
- más o menos artifacts que los esperados.

Un artifact rechazado nunca se entrega parcialmente al consumidor.

## Retención

La retención pertenece a la política del producto consumidor y al tipo de documento. PAE conserva referencias y metadatos mínimos; no decide unilateralmente cuánto tiempo guardar documentos fiscales, bancarios o de viaje.

