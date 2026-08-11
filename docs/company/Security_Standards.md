# Estándares de seguridad

| ID | Norma |
|---|---|
| SEC-01 | Validar autorización en la API con roles y relaciones persistidas; nunca confiar en roles enviados por el frontend. |
| SEC-02 | Aplicar mínimo privilegio y jerarquías explícitas a toda acción sensible. |
| SEC-03 | `PLATFORM_ADMIN` administra la plataforma y no interviene en la operación normal del cliente. |
| SEC-04 | Aislar todas las lecturas, escrituras y restricciones por `Workspace`. |
| SEC-05 | No eliminar físicamente registros contables confirmados. |
| SEC-06 | Cuando la política lo requiera, cancelar mediante cambio de estado en vez de modificar o borrar el registro. |
| SEC-07 | Toda acción sensible debe auditar actor, fecha, estado o valor anterior, estado o valor nuevo y motivo. |
| SEC-08 | No registrar, devolver ni exponer claves, tokens o secretos. |
| SEC-09 | No conservar archivos o contenido sensible si el producto no necesita conservarlos. |
| SEC-10 | Validar entradas binarias por contenido y no únicamente por MIME declarado. |
| SEC-11 | Puede usarse SHA-256 para detectar una carga binaria exactamente repetida sin conservar el archivo. |
| SEC-12 | Sanitizar errores externos sin eliminar la información técnica necesaria para diagnosticar de forma segura. |

Los nombres concretos de roles vigentes se documentan en el dominio; su aplicación siempre sigue estas reglas. Las políticas contables generales están en [Business Policies](./Business_Policies.md).

