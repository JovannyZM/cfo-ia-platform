# Arquitectura — Auxiliar de Gastos IA

```text
Texto ───────────────────────────────┐
Foto ──> Evidence ──────────────────┤
PDF ───> PDF texto / PDF a imagen ──┤
                                     ↓
                                   Brain
                                     ↓
                         ExpenseAssistantWorker
                                     ↓
                   ConversationSession (si falta algo)
                                     ↓
                                  Expense
                                     ↓
                                AuditEvent
```

## Canales

Telegram es un adaptador. Descarga la foto o PDF en memoria y llama al endpoint interno existente. Para texto llama al endpoint de texto. No contiene lógica financiera ni administra la sesión.

## Evidence

`EvidenceController` valida MIME, firma, tamaño y SHA-256. Para PDF valida una página. Extrae texto seleccionable o renderiza una página escaneada a PNG en memoria. Publica `ExpenseEvidenceReceived` y espera eventos correlacionados. No persiste binarios.

`ExpenseInterpreterWorker` usa el contrato `ExpenseEvidenceInterpreter`, valida la salida con Zod, aplica el umbral de confianza y emite `ExpenseEvidenceInterpreted` o `ExpenseEvidenceInterpretationFailed`.

## Texto

El endpoint ejecuta primero `LanguageNormalizer`, audita la normalización y respeta la prioridad: sesión activa, cancelación, política de corrección, gasto nuevo. Luego publica `ExpenseTextReceived`.

## Brain

Brain consulta el registro de Workers. No contiene reglas específicas del Auxiliar. Ejecuta secuencialmente, conserva `workspaceId` y `correlationId`, asigna `causationId` y publica los eventos devueltos.

## ExpenseAssistantWorker

Recibe evidencia interpretada o texto. Valida el payload, resuelve anomalías, instrumentos, responsable y campos obligatorios. Si falta algo emite `ExpenseInformationRequired`. Si está completo, crea `Expense` y `AuditEvent` en una transacción.

## ConversationSession

Persistencia genérica por Workspace, canal, conversación y usuario. Guarda intención, estado, borrador, campo pendiente y `sourceEventId`. La respuesta siguiente completa el mismo expediente; no reinterpreta evidencia ni crea otro flujo.

## Expense

Registro financiero persistente con importe original, moneda, tipo de cambio, importe base, comercio, concepto, categoría, responsable, método, instrumento, fuente, huella y estado. Los registros publicados no se editan; pueden pasar a `CANCELLED`.

## AuditEvent

Registra creación, cancelación, solicitudes de autorización, sesiones y normalización. Nunca sustituye la fila financiera y nunca se borra como parte del flujo normal.

## Duplicados

La huella se verifica antes del intérprete. La restricción única por Workspace protege también condiciones concurrentes. `sourceEventId` protege la creación durante continuaciones.

