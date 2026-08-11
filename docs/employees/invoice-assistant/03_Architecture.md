# Arquitectura — Auxiliar de Facturación v0.1

```text
Ticket o Expense
      ↓ (futuro)
Brain
      ↓
InvoiceRequest
      ↓ valida TaxProfile
MerchantInvoiceProfile
      ↓ selecciona estrategia
InvoicePortalAdapter
      ↓
InvoiceRequestAttempt
      ↓
InvoiceDocument XML/PDF
      ↓
AuditEvent
```

## Motor común

`InvoiceRequest` conserva el estado de la operación. `InvoiceRequestAttempt` separa cada ejecución y permite reintentos auditables. `InvoiceDocument` registra únicamente metadatos y una referencia abstracta de almacenamiento.

## Plantillas y adaptadores

`MerchantInvoiceProfile` contiene configuración y estrategia. `STANDARD_FORM` representa una plantilla común; `CUSTOM_ADAPTER` se reserva para portales que realmente requieran código específico. `EMAIL`, `WHATSAPP` y `MANUAL` permiten estrategias no web. La selección concreta de Costco y Chedraui sigue pendiente.

`InvoicePortalAdapter` define `canHandle`, `validateInput`, `execute`, `getRequiredFields` y `normalizeResult`. Los contratos puros viven en `packages/domain`; NestJS, Prisma y transportes quedan fuera del contrato.

## API v0.1

- `GET /workspaces/:workspaceId/invoice-requests`
- `GET /workspaces/:workspaceId/invoice-requests/:invoiceRequestId`

No existen endpoints de ejecución automática.
