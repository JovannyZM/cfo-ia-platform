# Casos de prueba — Auxiliar de Facturación v0.1

| ID | Caso | Resultado esperado | Estado |
|---|---|---|---|
| INV-001 | Crear solicitud | READY con comercio y TaxProfile válidos | AUTOMATIZADO |
| INV-002 | TaxProfile faltante | NEEDS_TAX_DATA | AUTOMATIZADO |
| INV-003 | TaxProfile no aprobado | Rechazo | AUTOMATIZADO |
| INV-004 | Costco/Chedraui | Comercio soportado | AUTOMATIZADO |
| INV-005 | Comercio desconocido | Rechazo | AUTOMATIZADO |
| INV-006 | Transición válida | Avanza según mapa | AUTOMATIZADO |
| INV-007 | Transición inválida | Rechazo | AUTOMATIZADO |
| INV-008 | Inicio | Intento y auditoría creados | AUTOMATIZADO |
| INV-009 | Fallo | Request/Attempt FAILED y AuditEvent | AUTOMATIZADO |
| INV-010 | Éxito XML | Documento XML y COMPLETED | AUTOMATIZADO |
| INV-011 | Éxito PDF | Documento PDF y COMPLETED | AUTOMATIZADO |
| INV-012 | Éxito XML+PDF | Ambos documentos y COMPLETED | AUTOMATIZADO |
| INV-013 | Idempotencia | Devuelve solicitud existente | AUTOMATIZADO |
| INV-014 | Lectura cruzada | No encuentra solicitud de otro Workspace | AUTOMATIZADO |
