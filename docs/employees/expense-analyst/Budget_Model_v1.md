# Modelo de Presupuestos v1.0

Este documento conserva la definición de la infraestructura de presupuestos consumida por el Analista de Gastos IA. **No declara graduado definitivamente al Analista ni declara construido al Auxiliar de Presupuestos.**

## Definición

Un `Budget` representa una bolsa autorizada de gasto, ahorro o inversión dentro de un `Workspace`. PostgreSQL es la fuente oficial. Las reglas se almacenan de forma relacional en `BudgetMatchingRule` para poder administrarlas después sin editar JSON opaco.

## Budget

| Campo | Tipo | Regla |
|---|---|---|
| `id` | UUID | Identificador. |
| `workspaceId` | UUID | Aislamiento multi-tenant; FK con `ON DELETE RESTRICT`. |
| `name` | texto | Único dentro del Workspace. |
| `amount` | Decimal(19,4) | Monto autorizado. |
| `currency` | varchar(3) | Moneda del presupuesto. |
| `period` | enum | `MONTHLY`, `ANNUAL` o `PER_EVENT`. |
| `nature` | enum | `EXPENSE`, `SAVING` o `INVESTMENT`. |
| `startDate` | fecha | Inicio de vigencia. |
| `endDate` | fecha opcional | Fin de vigencia. |
| `active` | booleano | `true` representa ACTIVE; `false`, INACTIVE. |
| `createdAt`, `updatedAt` | timestamp | Trazabilidad técnica. |

## BudgetMatchingRule

| Campo | Tipo | Regla |
|---|---|---|
| `id` | UUID | Identificador. |
| `budgetId` | UUID | FK a Budget con `ON DELETE RESTRICT`. |
| `ruleType` | enum | `EXPLICIT_ALIAS`, `MERCHANT_NAME`, `KEYWORD` o `EXPENSE_CATEGORY`. |
| `value` | texto | Valor observable original. |
| `normalizedValue` | texto | Valor sin acentos, recortado, espacios compactados y en mayúsculas. |
| `priority` | entero | Orden explícito de clasificación. |
| `active` | booleano | Permite desactivar sin borrar. |
| `createdAt`, `updatedAt` | timestamp | Trazabilidad técnica. |

Una regla no puede repetirse dentro del mismo Budget para el mismo tipo y valor normalizado.

## Prioridad de clasificación

1. Presupuesto indicado explícitamente por el usuario.
2. Alias explícito (`EXPLICIT_ALIAS`).
3. Regla específica conocida (`KEYWORD`).
4. Comercio o proveedor (`MERCHANT_NAME`).
5. Categoría general (`EXPENSE_CATEGORY`).
6. `Otros`, únicamente si una regla residual coincide claramente.

El clasificador recibe un gasto estructurado y devuelve `budgetId`, `confidence`, `matchedRule`, `reason` y `ambiguous`. No modifica el `Expense`. Si dos presupuestos tienen la prioridad máxima, devuelve `ambiguous: true` sin elegir. Si no existe coincidencia, devuelve `budgetId: null`; nunca usa Otros automáticamente.

`ExpenseBudgetAssignment` conserva por separado la sugerencia para cada gasto. Su estado es `ASSIGNED`, `AMBIGUOUS` o `UNMATCHED`; registra confianza, regla, motivo y si la asignación provino de una regla, selección explícita o intervención manual. Existe como máximo una por `expenseId` en v1.0 y su creación genera auditoría.

`ExpenseBudgetClassifierWorker` escucha `ExpenseRegistered`, crea la asignación idempotente y no publica análisis ni modifica importes. El backfill usa el mismo servicio, procesa únicamente gastos `REGISTERED` sin asignación e ignora `CANCELLED`.

La comparación es insensible a mayúsculas, acentos y espacios externos. No inventa centro de costo, proyecto, titular o persona.

## Ejemplos reales

- `CFE` coincide con Luz.
- `NETFLIX` y `NETFLIZ` coinciden con Netflix.
- `MOUNJARO` coincide con Mounjaro.
- “cumpleaños Esli” prevalece sobre una categoría residual Liverpool.
- El alias Disney prevalece sobre Costco u Otras APP cuando aparece el contexto Disney.
- Una gasolinera sin contexto de viaje puede coincidir con Gasolina, pero no con JZM viático.
- Una coincidencia específica prevalece sobre una regla de Otros.

## Ambigüedades conocidas

- TELCEL y MOVISTAR pertenecen tanto a Cel Esli como a Cel JZM. Sin una indicación adicional, el resultado es ambiguo; no se infiere titular por comercio.
- “Gas” y “Gasolina” son conceptos distintos. La regla de viático exige contexto explícito de viaje o fuera de Xalapa.
- Una fotografía diferente del mismo concepto no aporta por sí sola contexto presupuestal.
- El seed usa MXN. Los presupuestos mensuales inician el 2026-08-01 y los anuales el 2026-01-01.

## Seed inicial

El Workspace `00000000-0000-4000-8000-000000000007` recibe 27 presupuestos: 20 mensuales y 7 anuales, con 58 reglas relacionales. No se crea ningún presupuesto `PER_EVENT` porque la fuente inicial no proporcionó uno.

## Administración futura

El futuro Auxiliar de Presupuestos será el único Employee responsable de crear, aumentar, disminuir, activar, desactivar o cerrar presupuestos a partir de órdenes coordinadas por Brain. El Analista de Gastos consume presupuestos para análisis, pero no los modifica.

## Fuera de v1.0

- Auxiliar de Presupuestos.
- Escritura de presupuestos por API.
- Cálculos financieros dentro de la asignación.
- Excel, PDF o presentaciones.
- CFO IA.
- Nuevos canales.
- Centros de costos, proyectos o personas inferidos.
- Resolución silenciosa de ambigüedades.
