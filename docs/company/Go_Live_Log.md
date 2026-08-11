# Go Live Log

## Workspace 00000000-0000-4000-8000-000000000007

- Fecha: 2026-08-05
- Nombre: OperaciÃ³n principal
- Estado: preparado para iniciar operaciÃ³n real desde cero
- Zona horaria: `America/Mexico_City`

### Datos de prueba eliminados

- Expenses: 60 (51 `REGISTERED`, 9 `CANCELLED`)
- ExpenseBudgetAssignments: 51
- AuditEvents transaccionales: 274
  - 182 vinculados a Expenses, asignaciones y sesiones
  - 92 eventos `TEXT_NORMALIZED` del Workspace generados durante las pruebas
- ConversationSessions: 22 (21 `COMPLETED`, 1 `CANCELLED`)
- ExpenseConversations heredadas: 0
- Fingerprints SHA-256: 4, eliminados junto con sus Expenses
- Solicitudes de cancelaciÃ³n persistidas por separado: 0; sus eventos y sesiones quedaron incluidos en la limpieza

La limpieza se ejecutÃ³ en una transacciÃ³n `SERIALIZABLE`, utilizando exclusivamente IDs obtenidos del Workspace indicado.

### ConfiguraciÃ³n conservada

- Workspace, usuarios, roles y permisos
- PaymentInstruments: 3
- Budgets: 27
- BudgetMatchingRules: 58
- Presupuesto mensual EXPENSE: 102500 MXN
- Presupuesto mensual SAVING: 5000 MXN
- Presupuesto mensual INVESTMENT: 5000 MXN
- Presupuesto mensual total: 112500 MXN
- Migraciones, catÃ¡logos, documentaciÃ³n, cÃ³digo y pruebas

### Estado inicial validado

- Expenses: 0
- ExpenseBudgetAssignments: 0
- Sesiones transaccionales abiertas: 0
- Fingerprints: 0
- Gasto del dÃ­a: 0 MXN
- Gasto del mes: 0 MXN
- Monto sin clasificar: 0 MXN
- Monto ambiguo: 0 MXN
- Presupuesto ejercido: 0 %
- Estado global del Analista: `NORMAL`

### Deuda tÃ©cnica

- Reparar las credenciales de `TEST_DATABASE_URL`.
- Ejecutar satisfactoriamente la suite completa de integraciÃ³n PostgreSQL.
- Documentar su resultado antes de declarar validaciÃ³n tÃ©cnica completa.
- El scheduler de las 9 pm permanece fuera de alcance y no fue habilitado.
