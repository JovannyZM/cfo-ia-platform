# Decisiones — Auxiliar de Facturación v0.1

## Motor común antes de automatizar

- **Fecha:** 2026-08-05
- **Motivo:** Evitar una implementación distinta por comercio.
- **Decisión:** Modelar primero solicitud, intento, documento, perfil y adapter.
- **Impacto:** Costco y Chedraui compartirán el mismo ciclo de vida.

## Estrategia nullable durante diseño

- **Fecha:** 2026-08-05
- **Motivo:** No existe validación real que permita elegir la estrategia final.
- **Decisión:** Los perfiles iniciales quedan activos pero con estrategia y adapter sin definir.
- **Impacto:** No se presenta una suposición como decisión operativa.

## Reutilizar TaxProfile

- **Fecha:** 2026-08-05
- **Motivo:** Evitar divergencia de RFC y demás datos fiscales.
- **Decisión:** La solicitud referencia `TaxProfile`.
- **Impacto:** Antes de automatizar habrá que completar en el modelo fiscal los campos que todavía no existen.

## Storage abstracto

- **Fecha:** 2026-08-05
- **Motivo:** El proveedor definitivo no está decidido.
- **Decisión:** Persistir `storageReference` y checksum, sin adoptar S3 ni almacenamiento local.
- **Impacto:** El motor no queda acoplado a infraestructura propietaria.
