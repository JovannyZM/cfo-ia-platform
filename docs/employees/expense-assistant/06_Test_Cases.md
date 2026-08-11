# Casos de prueba ejecutados

Estados: `APROBADO`, `FALLIDO`, `PENDIENTE`. Los fallos históricos aquí incluidos fueron observados y posteriormente corregidos.

## Estado de validación

- **Aprobación funcional:** APROBADO FUNCIONALMENTE desde 2026-08-04.
- **Validación técnica completa:** PENDIENTE.
- **Producción técnica completa:** PENDIENTE.
- **Bloqueo vigente:** la integración PostgreSQL completa no se ha ejecutado satisfactoriamente porque las credenciales de `TEST_DATABASE_URL` son inválidas.
- Los casos aprobados conservan su resultado histórico; este bloqueo no los invalida ni permite declarar aprobada la suite pendiente.

| ID | Área | Entrada | Resultado esperado | Resultado obtenido | Estado |
|---|---|---|---|---|---|
| TXT-001 | Texto | `Compré gasolina por 850 pesos con mi BBVA Infinite.` | Flujo de gasto, no ticket | Registró gasto por texto | APROBADO |
| TXT-002 | Texto incompleto | `Compré gasolina.` | Preguntar solo importe | `¿Cuánto pagaste?` | APROBADO |
| TXT-003 | Continuación | `850` tras TXT-002 | Continuar expediente | Conservó concepto y continuó | APROBADO |
| TXT-004 | Miles | `85000` | Importe 85000 | Interpretado como 85000 | APROBADO |
| TXT-005 | Miles | `85,000` | Importe 85000 | Interpretado como 85000 | APROBADO |
| TXT-006 | Miles | `85 000` | Importe 85000 | Interpretado como 85000 | APROBADO |
| TXT-007 | Miles | `$85,000.00` | Importe 85000 | Interpretado como 85000 | APROBADO |
| TXT-008 | Anomalía | Gasolina por 85,000 en efectivo, JZM | Pedir confirmación, no registrar | Solicitó confirmación | APROBADO |
| TXT-009 | Anomalía | `Sí` | Registrar expediente conservado | Registro habilitado sin duplicar | APROBADO |
| TXT-010 | Anomalía | `No` | Preguntar importe correcto | Preguntó solo importe | APROBADO |
| TXT-011 | Compacto | `gasolin 850 lo hice jzm en ejectivo` | Gasolina, 850, JZM, efectivo | Extraído determinísticamente | APROBADO |
| TXT-012 | Compacto | `cafe 380 lo pago ana con deboto` | Café, 380, Ana, débito | Extraído determinísticamente | APROBADO |
| TXT-013 | Compacto | `estacionamiento 120 por jzm en eftivo` | Estacionamiento, 120, JZM, efectivo | Extraído determinísticamente | APROBADO |
| TXT-014 | Responsable | `gasolin 850 lo hizo jzm en efectivo` | JZM | No volvió a preguntar responsable | APROBADO |
| TXT-015 | Responsable | `cafe 380 lo realizo ana con debito` | Ana | No volvió a preguntar responsable | APROBADO |
| TXT-016 | Responsable | `estacionamiento 120 lo pago carlos en efectivo` | Carlos | No volvió a preguntar responsable | APROBADO |
| TXT-017 | Responsable | `compras 900 fue de mi esposa con credito` | mi esposa | Responsable detectado | APROBADO |
| TXT-018 | Concepto | `gaste 300 en gasolina` | Gasolina | No guardó “gaste” | APROBADO |
| TXT-019 | Concepto | `compre en el super por 850` | Supermercado | Concepto útil | APROBADO |
| TXT-020 | Concepto | `pague uniforme juan 1200` | Uniforme Juan | Concepto útil | APROBADO |
| TXT-021 | Concepto | `compre cafe para la oficina por 380` | Café para la oficina | Concepto útil | APROBADO |
| NRM-001 | Ortografía | `ejectivo` | efectivo | Normalizado | APROBADO |
| NRM-002 | Ortografía | `deboto` | débito | Normalizado | APROBADO |
| NRM-003 | Ortografía | `trasferencia` | transferencia | Normalizado | APROBADO |
| NRM-004 | Contexto | `gato jzm` con expediente activo | Usar contexto sin inventar | Contexto preservado | APROBADO |
| NRM-005 | Ambigüedad | Texto ambiguo | Conservar original | Original conservado | APROBADO |
| PUB-001 | Corrección | `No fueron 300, fueron 250.` | No modificar ni crear | Mensaje de política exacto | APROBADO |
| PUB-002 | Corrección | `No fue efectivo, fue crédito` | No modificar | Mensaje de política exacto | APROBADO |
| PUB-003 | Corrección | `No lo hizo JZM, lo hizo Ana` | No modificar | Mensaje de política exacto | APROBADO |
| CAN-001 | Cancelación | `Cancela el último gasto.` | Prioridad CANCEL | Solicitó motivo o autorización | APROBADO |
| CAN-002 | Cancelación | `Cancela el gasto de 450 por comida` | Buscar por detalle | Candidato localizado/lista segura | APROBADO |
| CAN-003 | Cancelación | Cero coincidencias | Mostrar últimos cinco | Lista numerada | APROBADO |
| CAN-004 | Cancelación | Varias coincidencias | No cancelar ambiguamente | Lista numerada | APROBADO |
| CAN-005 | Selección | `2` | Elegir ID número 2 | Eligió exclusivamente el ID persistido | APROBADO |
| CAN-006 | Selección | `9` fuera de rango | Mantener cancelación | No creó gasto nuevo | APROBADO |
| CAN-007 | Permisos | MEMBER cancela | Solicitar autorización | Auditó solicitud | APROBADO |
| CAN-008 | Permisos | Account Admin cancela | Pedir motivo | Preguntó motivo | APROBADO |
| CAN-009 | Persistencia | Cancelación autorizada | `CANCELLED`, conservar fila y auditoría | Validado con PostgreSQL anteriormente | APROBADO |
| IMG-001 | Foto real | Ticket Costco $598.20 | Interpretar y registrar | Registrado con AuditEvent | APROBADO |
| IMG-002 | Foto real | Relectura independiente Costco | Consistencia | Lectura ejecutada con nuevo evento | APROBADO |
| IMG-003 | Foto real | Costco $1,570.49, ticket 0331 | Extraer cinco productos y campos | Flujo real ejecutado | APROBADO |
| IMG-004 | Documento | Ticket 0330 vs autorización 825371 | Usar ticket, no autorización | Regla corregida y validada | APROBADO |
| IMG-005 | Tarjeta | Débito con últimos cuatro | Conservar método y last4 | Validado | APROBADO |
| IMG-006 | Tarjeta conocida | Last4 aprendido | Asignar titular | No preguntó responsable | APROBADO |
| IMG-007 | Tarjeta desconocida | Last4 nuevo | Preguntar nombre y titular | Pregunta única | APROBADO |
| IMG-008 | Sesión | Foto sin responsable/método | Conservar interpretación | Preguntó solo faltantes | APROBADO |
| IMG-009 | Duplicado | Misma imagen exacta dos veces | Una llamada/Expense/AuditEvent | Bloqueado por SHA-256 | APROBADO |
| PDF-001 | PDF texto | Factura PDF de una página | Extraer texto en memoria | Ruta de texto aprobada | APROBADO |
| PDF-002 | PDF escaneado | Una página sin texto | Renderizar PNG en memoria | Ruta de imagen aprobada | APROBADO |
| PDF-003 | PDF multipágina | Dos páginas | Rechazar con mensaje exacto | Rechazado sin publicar | APROBADO |
| PDF-004 | PDF inválido | Documento no financiero | No registrar | `INVALID_EXPENSE_EVIDENCE` | APROBADO |
| PDF-005 | PDF duplicado | Mismo PDF exacto | No interpretar dos veces | Bloqueado antes del intérprete | APROBADO |
| PDF-006 | PDF real CFDI | Cyberpuerta ABFA 239061801 | Emisor, RFC, total, fecha, transferencia y folio correctos | JSON correcto, confianza 0.99 | APROBADO |
| PDF-007 | PDF real CFDI | Mismo CFDI sin responsable visible | Preguntar solo responsable | Telegram: `¿Quién hizo este gasto?`, ok=true | APROBADO |
| PDF-008 | Continuación CFDI | Respuesta de responsable | Registrar Expense y AuditEvent | Esperando respuesta del usuario | PENDIENTE |
| SEC-001 | Archivo | MIME no coincide con bytes | Rechazar | Rechazado | APROBADO |
| SEC-002 | Archivo | Más de 10 MB | Rechazar sin Expense | Rechazado | APROBADO |
| BUS-001 | Brain | Varios Workers | Secuencial y ordenado | Aprobado | APROBADO |
| BUS-002 | Brain | Worker falla | Detener y propagar | Aprobado | APROBADO |
| BUS-003 | Trazabilidad | Evento resultante | workspace/correlation/causation | Aprobado | APROBADO |
| DB-001 | Idempotencia | Mismo sourceEventId | Un Expense y AuditEvent | Aprobado con PostgreSQL | APROBADO |
| DB-002 | Multi-tenant | Lectura cruzada | Denegar | Aprobado con PostgreSQL | APROBADO |
| OPS-001 | Telegram | `prueba` | `✅ Conexión confirmada` | Entrega real, ok=true | APROBADO |
| OPS-002 | Integración actual | Suite PostgreSQL | Ejecutar completa y documentar el resultado | No se ejecutó satisfactoriamente: credenciales inválidas de `TEST_DATABASE_URL` | PENDIENTE |
