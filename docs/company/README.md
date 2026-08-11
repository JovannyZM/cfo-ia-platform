# Documentación corporativa de CFO IA

Esta carpeta contiene principios, estándares, proceso y registros comunes a todos los Employees. La documentación específica de cada Employee permanece bajo `docs/employees/<employee>/`.

## Qué consultar

| Necesidad | Documento |
|---|---|
| Entender qué producto construimos | [Design Philosophy](./Design_Philosophy.md) |
| Diseñar comportamiento con IA | [AI Principles](./AI_Principles.md) |
| Diseñar Brain, Workers, eventos y persistencia | [Architecture Standards](./Architecture_Standards.md) |
| Diseñar una interacción multimensaje | [Conversation Standards](./Conversation_Standards.md) |
| Definir roles, permisos, auditoría y datos sensibles | [Security Standards](./Security_Standards.md) |
| Definir y ejecutar validación | [Testing Standards](./Testing_Standards.md) |
| Conocer el ciclo oficial de construcción | [Development Process](./Development_Process.md) |
| Construir un Employee paso a paso | [Employee Builder Manual](./Employee_Builder_Manual.md) |
| Consultar políticas empresariales transversales | [Business Policies](./Business_Policies.md) |
| Solicitar trabajo a Codex | [Prompting Standards](./Prompting_Standards.md) |
| Registrar una prueba real | [Smoke Test Template](./Smoke_Test_Template.md) |
| Consultar estado de Employees | [Employee Status Register](./Employee_Status_Register.md) |
| Consultar decisiones de plataforma | [Global Decision Log](./Global_Decision_Log.md) |
| Consultar pendientes corporativos | [Company Backlog](./Company_Backlog.md) |

## Documentos obligatorios antes de crear un Employee

1. [Design Philosophy](./Design_Philosophy.md).
2. [AI Principles](./AI_Principles.md).
3. [Architecture Standards](./Architecture_Standards.md).
4. [Conversation Standards](./Conversation_Standards.md), si habrá conversación.
5. [Security Standards](./Security_Standards.md).
6. [Testing Standards](./Testing_Standards.md).
7. [Development Process](./Development_Process.md).
8. [Employee Builder Manual](./Employee_Builder_Manual.md).
9. [Business Policies](./Business_Policies.md).

## Clasificación de reglas

Se revisaron las 117 reglas de negocio y las 50 reglas de oro del [Auxiliar de Gastos IA](../employees/expense-assistant/02_Business_Rules.md). Debido a que varias reglas de oro reformulan reglas de negocio, la fuente contiene aproximadamente 167 enunciados, no 167 normas necesariamente únicas.

Tras eliminar repeticiones, se extrajeron **72 reglas corporativas reutilizables** con identificadores estables:

| Clasificación | Cantidad | Ubicación |
|---|---:|---|
| Corporativas — IA y políticas generales | 20 | [AI Principles](./AI_Principles.md) y [Business Policies](./Business_Policies.md) |
| Arquitectura | 14 | [Architecture Standards](./Architecture_Standards.md) |
| Conversación | 12 | [Conversation Standards](./Conversation_Standards.md) |
| Seguridad | 12 | [Security Standards](./Security_Standards.md) |
| Pruebas | 14 | [Testing Standards](./Testing_Standards.md) |
| **Total corporativo reutilizable** | **72** | |

Las reglas exclusivas del Auxiliar —modelo y alta de `Expense`, parsing de texto, anomalía de gasolina, aprendizaje de tarjetas, tickets, PDF de una página, CFDI, conceptos, duplicados documentales y cancelación específica de gastos— **no se copiaron** a las políticas corporativas. Permanecen en su [Business Rules](../employees/expense-assistant/02_Business_Rules.md), [Architecture](../employees/expense-assistant/03_Architecture.md) y [Known Issues](../employees/expense-assistant/08_Known_Issues.md).

Los principios de filosofía, el proceso y las reglas para solicitar trabajo explican cómo aplicar el catálogo; no se vuelven a contar para evitar duplicación.

## Cómo actualizar

- Una regla transversal nueva se agrega una sola vez al estándar propietario y recibe el siguiente ID de su categoría.
- Una regla exclusiva se documenta únicamente dentro del Employee.
- Una decisión transversal se agrega a [Global Decision Log](./Global_Decision_Log.md); una decisión local queda con el Employee.
- Al cambiar el estado de un Employee se actualizan su perfil, pruebas, changelog y [Employee Status Register](./Employee_Status_Register.md).
- Un resultado pendiente o fallido se conserva como tal; no se reemplaza por una simulación.
- Los enlaces deben ser relativos y los términos `Brain`, `Worker`, `Employee`, `ConversationSession`, `Workspace`, `Evidence` y `AuditEvent` deben conservar este significado.

## Estado documental del Auxiliar

El perfil, la matriz de pruebas, el changelog y las incidencias del Auxiliar están alineados con el [registro central](./Employee_Status_Register.md): estado `APROBADO FUNCIONALMENTE`, graduación funcional el 2026-08-04 y producción técnica completa pendiente hasta reparar `TEST_DATABASE_URL`, ejecutar la integración PostgreSQL completa y documentar su resultado.
