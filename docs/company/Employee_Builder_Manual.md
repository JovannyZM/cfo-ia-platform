# Manual operativo para construir un Employee

Este manual aplica el [proceso corporativo](./Development_Process.md). Antes de implementar, revise [Design Philosophy](./Design_Philosophy.md), [Architecture Standards](./Architecture_Standards.md), [Business Policies](./Business_Policies.md) y [Security Standards](./Security_Standards.md).

## 1. Plantilla de misión

```md
# Misión — <Nombre comercial>

- Problema empresarial:
- Misión en una oración:
- Resultado observable:
- Jefe directo: Brain
- Responsabilidad única:
- Beneficiario:
- Límites v1.0:
- Fuera de alcance:
```

## 2. Plantilla de perfil de puesto

```md
# Perfil — <Employee>

- Nombre comercial:
- Nombre técnico / Worker:
- Área:
- Versión:
- Estado:
- Fecha de inicio:
- Fecha de graduación:
- Misión:
- Objetivo:
- Jefe directo: Brain

## Entradas permitidas
## Salidas
## Responsabilidades
## Límites
## Qué sí hace
## Qué NO hace
## Dependencias
## KPIs
## Backlog de la siguiente versión
```

## 3. Plantilla de reglas de negocio

```md
# Reglas de negocio — <Employee>

| ID | Categoría | Regla | Fuente | Prueba asociada |
|---|---|---|---|---|
| <EMP>-BR-001 |  |  |  |  |

## Datos mínimos
## Estados y transiciones
## Autorización
## Ambigüedad y fallos seguros
## Auditoría
## Límites explícitos
```

Antes de agregar una regla, verificar si ya existe en [AI Principles](./AI_Principles.md), [Conversation Standards](./Conversation_Standards.md), [Security Standards](./Security_Standards.md) o [Business Policies](./Business_Policies.md).

## 4. Plantilla de decisiones

```md
## <ID> — <Decisión>

- Fecha:
- Motivo:
- Alternativas evaluadas:
- Por qué se eligió:
- Impacto:
- Empleados afectados:
- Estado: VIGENTE | REEMPLAZADA
```

Una decisión exclusiva vive con el Employee; una decisión transversal se registra también en [Global Decision Log](./Global_Decision_Log.md).

## 5. Plantilla de pruebas

```md
| ID | Categoría | Caso | Entrada | Resultado esperado | Resultado obtenido | Estado | Evidencia |
|---|---|---|---|---|---|---|---|
|  | Unit / Integration / Real / Regression |  |  |  |  | PENDIENTE |  |
```

Incluir caso feliz, datos faltantes, autorización, aislamiento de Workspace, ambigüedad, fallo externo, auditoría e idempotencia cuando apliquen. Seguir [Testing Standards](./Testing_Standards.md).

## 6. Plantilla de graduación

```md
# Graduación — <Employee> v<versión>

- Misión cumplida: Sí / No
- Alcance v1.0 completo: Sí / No
- Unitarias: resultado real
- Integración: resultado real
- Typecheck: resultado real
- Lint: resultado real
- Build: resultado real
- Pruebas reales: resultado y evidencia
- Bugs bloqueantes abiertos:
- Límites documentados: Sí / No
- Perfil, reglas, decisiones, pruebas y changelog actualizados: Sí / No
- Estado final: PENDIENTE | APROBADO FUNCIONALMENTE | GRADUADO
- Aprobador:
- Fecha:
```

Un pendiente por credenciales debe quedar explícito; nunca se sustituye por un resultado simulado.

## 7. Plantilla de backlog

```md
# Backlog — <Employee>

## Bloqueantes
## Alta prioridad
## Media prioridad
## Baja prioridad
## Deuda técnica
## Ideas futuras

| Elemento | Motivo | Versión objetivo | Evidencia / origen |
|---|---|---|---|
```

No inventar fecha ni prioridad. Las mejoras no críticas pasan a la siguiente versión.

## 8. Plantilla de changelog

```md
# Changelog — <Employee>

## v0.x — <hito>
- Agregado:
- Cambiado:
- Corregido:
- Validación:

## v1.0 — Graduación
- Alcance final:
- Límites conocidos:
- Pruebas reales:
```

## 9. Plantilla de KPIs

```md
# KPIs — <Employee>

| KPI | Definición | Fuente oficial | Meta | Frecuencia | Responsable |
|---|---|---|---|---|---|
|  |  | PostgreSQL |  |  |  |
```

No inventar métricas o metas. Un KPI debe medir el cumplimiento de la misión y tener una fuente auditable.

## Checklist técnico

- [ ] Contratos y eventos están definidos sin acoplamiento al transporte.
- [ ] El Worker tiene responsabilidad única y no publica directamente.
- [ ] Brain no contiene ramas por Employee.
- [ ] Autorización e aislamiento por Workspace se validan en la API.
- [ ] Persistencia y transacciones preservan integridad.
- [ ] `AuditEvent` cubre acciones sensibles.
- [ ] `ConversationSession` conserva contexto si el flujo es multimensaje.
- [ ] Proveedores externos están detrás de contratos y tienen fake.
- [ ] Salidas de IA se validan estructuralmente.
- [ ] Secretos y contenido sensible no aparecen en logs.
- [ ] Unitarias e integración pasan realmente.
- [ ] Typecheck, lint y build pasan realmente.

## Checklist de prueba real

- [ ] El proceso real ejecuta la versión actual.
- [ ] Se probó cada canal incluido en v1.0.
- [ ] Se verificó respuesta externa, no solo resultado interno.
- [ ] Se verificó PostgreSQL y auditoría cuando corresponde.
- [ ] Se probaron datos faltantes, ambigüedad y error seguro.
- [ ] Cada bug real quedó como regresión automatizada.
- [ ] La evidencia se registró con [Smoke Test Template](./Smoke_Test_Template.md).

## Checklist de producción

- [ ] Configuración requerida documentada sin secretos.
- [ ] Migraciones revisadas y aplicadas en el entorno autorizado.
- [ ] Permisos y mínimo privilegio verificados.
- [ ] No hay bugs bloqueantes abiertos.
- [ ] Fallos externos son seguros y sanitizados.
- [ ] Límites y deuda técnica están documentados.
- [ ] Perfil, changelog y registro central están actualizados.
- [ ] v1.0 está congelada y las mejoras quedaron en backlog.

El [Auxiliar de Gastos IA](../employees/expense-assistant/01_Profile.md) es la referencia concreta del método, no una plantilla para copiar reglas exclusivas de gastos.

