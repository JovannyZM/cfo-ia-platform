# Estándares de arquitectura

## Flujo reutilizable

```text
Canal (Telegram / Web / futuro)
                 |
                 v
Adaptador de canal --> Normalización / Evidence
                 |
                 v
              Brain
                 |
                 v
        Worker(s) registrados
                 |
                 v
 ConversationSession (si falta información)
                 |
                 v
     PostgreSQL + AuditEvent
                 |
                 v
       Respuesta derivada al canal
```

## Normas

| ID | Norma |
|---|---|
| ARC-01 | Brain decide qué Workers ejecutar mediante `WorkerRegistry`; no conoce Employees concretos. |
| ARC-02 | Los Employees no se comunican directamente entre sí: reportan resultados a Brain mediante `DomainEvent`. |
| ARC-03 | Un Worker tiene responsabilidad única y devuelve eventos; no controla ni inyecta `EventBus`. |
| ARC-04 | Brain publica los eventos resultantes y conserva correlación, causalidad y Workspace. |
| ARC-05 | Los Workers de un evento se ejecutan secuencialmente y en orden de registro. |
| ARC-06 | Si un Worker falla, la cadena se detiene, el error se propaga y no se publican sus resultados parciales. |
| ARC-07 | `DomainEvent` es independiente de NestJS, Prisma y transportes. |
| ARC-08 | `ConversationSession` es el expediente persistente y genérico para interacciones incompletas. |
| ARC-09 | `Evidence` es una frontera técnica para validar e interpretar entradas, sin contaminar la lógica del Employee. |
| ARC-10 | `AuditEvent` es la bitácora transversal; no sustituye el registro de negocio. |
| ARC-11 | Los adaptadores de canal transportan entradas y respuestas; no conocen Workers concretos ni deciden negocio. |
| ARC-12 | Proveedores y servicios técnicos se aíslan detrás de contratos, con implementación real y fake cuando corresponda. |
| ARC-13 | PostgreSQL es la fuente oficial del estado persistente de negocio. |
| ARC-14 | Excel, PDF y presentaciones son salidas derivadas; nunca sustituyen la fuente oficial. |

## Componentes

- **Brain:** orquesta sin reglas por Employee.
- **Worker:** ejecuta una responsabilidad y produce eventos.
- **DomainEvent:** sobre común con `workspaceId`, trazabilidad y payload.
- **ConversationSession:** conserva intención, contexto y dato pendiente a través de mensajes y reinicios.
- **Evidence:** valida entradas documentales y produce información estructurada.
- **AuditEvent:** conserva quién hizo qué, cuándo y por qué.
- **Jerarquías y permisos:** se resuelven en la API con datos persistidos.
- **Servicios compartidos:** normalización, adaptadores técnicos, selección segura y validación estructurada.

Véanse [Conversation Standards](./Conversation_Standards.md), [Security Standards](./Security_Standards.md) y los [patrones originales del Auxiliar](../employees/expense-assistant/09_Reusable_Patterns.md).

