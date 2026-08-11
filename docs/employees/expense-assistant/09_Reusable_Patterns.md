# Patrones reutilizables

## Worker

Contrato puro con responsabilidad única, eventos declarados y resultado `Promise<readonly DomainEvent[]>`. Reutilizable por cualquier empleado.

## WorkerRegistry

Registro determinístico, detección de IDs duplicados y búsqueda por tipo de evento.

## Brain

Orquestador sin conocimiento de empleados específicos. Conserva trazabilidad y publica resultados.

## DomainEvent

Sobre común con Workspace, correlación, causalidad y fecha, independiente de NestJS y Prisma.

## EventBus en memoria

Adecuado para MVP y pruebas locales de cadenas de eventos.

## ConversationSession

Expediente persistente genérico por intención, canal y usuario. Aplicable a cualquier empleado que necesite solicitar datos gradualmente.

## AuditEvent

Bitácora transversal para acciones, transiciones, solicitudes y sesiones.

## Evidence

Frontera única para archivos efímeros: MIME, tamaño, firma, transformación en memoria e interpretación estructurada.

## Adaptador de intérprete

Interfaz de dominio, implementación real y fake. Permite cambiar proveedor sin contaminar Workers.

## Salida estructurada con Zod

La respuesta de IA no entra al dominio hasta validar esquema, confianza y campos obligatorios.

## SHA-256

Idempotencia exacta sin almacenar el binario. Reutilizable para entradas efímeras de otros empleados.

## LanguageNormalizer

Normalización transversal antes de Brain, preservando texto original, confianza y cambios.

## Diccionarios determinísticos

Correcciones baratas y auditables para vocabulario estable; evitan llamadas innecesarias de IA.

## Jerarquías de autorización

La intención se detecta separada de la autorización; la API decide con roles persistidos.

## Selección segura

Cuando una búsqueda es ambigua, mostrar candidatos y persistir IDs exactos. Aplicable a cancelar, aprobar o asociar cualquier entidad.

## Aprendizaje explícito

Entidad propia y clave natural acotada en vez de inferencias probabilísticas ocultas.

## Telegram Adapter

Transporte reutilizable que llama endpoints internos y responde al mismo chat, sin lógica de negocio.

## Políticas aisladas

Reglas reemplazables, como anomalías o no corrección, viven en módulos pequeños y comprobables.

## Soft state transitions

Documentos relevantes cambian de estado y conservan historial; no se borran físicamente.

