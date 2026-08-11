# Reglas de negocio — Auxiliar de Gastos IA

## Publicación y trazabilidad

1. Un gasto publicado nunca se modifica.
2. Para corregir un gasto publicado se debe cancelar y registrar uno nuevo.
3. Una frase de corrección no ejecuta `UPDATE` sobre `Expense`.
4. Una frase de corrección no crea un gasto nuevo.
5. La respuesta de política es: “No puedo modificar un gasto ya registrado. Debes cancelarlo y registrar uno nuevo.”
6. Los `AuditEvent` históricos de correcciones anteriores se conservan.
7. Ningún gasto confirmado se elimina físicamente.
8. Un gasto confirmado solo pasa de `REGISTERED` a `CANCELLED`.
9. La cancelación conserva la fila, estado anterior, estado nuevo, actor, fecha y motivo.
10. Todo registro y toda cancelación deben producir auditoría.

## Calidad y confianza

11. La IA no inventa información.
12. Un dato no visible o no confiable se representa como ausente.
13. Cuando falta un dato obligatorio, se pregunta únicamente ese dato.
14. El gasto no se registra hasta completar sus datos mínimos.
15. Una respuesta de continuación no se interpreta como gasto nuevo.
16. Un documento sin evidencia válida de gasto se rechaza.
17. Una interpretación con confianza menor al umbral se envía a revisión y no crea un gasto.
18. Los errores del proveedor se sanitizan.
19. No se registran claves, imágenes completas ni respuestas sensibles.

## Datos mínimos del gasto

20. Deben existir comercio o concepto útil, importe positivo, moneda ISO y fecha válida.
21. Debe existir responsable.
22. Debe existir método de pago.
23. Para moneda distinta a la base del Workspace se requiere tipo de cambio.
24. `baseAmount` se calcula con decimales, no con IA.
25. Importes iguales o menores a cero se rechazan.
26. La fecha mostrada es `occurredAt`, nunca `createdAt`.
27. Comercio y concepto no se muestran duplicados.
28. Verbos como gasté, pagué o compré no son conceptos válidos por sí solos.
29. Conteos como “3 artículos” no son conceptos útiles.
30. Si no puede inferirse un concepto útil sin inventar, se omite.

## Texto

31. En v1.0 se procesa un gasto por mensaje.
32. Texto completo puede registrar directamente.
33. Texto incompleto abre o continúa una sesión `NEW_EXPENSE`.
34. “Yo” usa la identidad disponible del usuario de Telegram.
35. Las menciones determinísticas de otra persona se guardan como responsable.
36. Separadores `85000`, `85,000`, `85 000`, `$85,000` y `$85,000.00` representan el mismo importe.
37. La coma puede ser separador de miles en español mexicano.
38. Gasolina superior a $10,000 MXN requiere confirmación en la regla temporal de v1.0.
39. Antes de confirmar un importe inusual no se registra el gasto.
40. “No” ante la anomalía conserva los demás campos y solicita solo el importe correcto.

## Normalización

41. Todo texto se normaliza antes de Brain.
42. Brain recibe texto original y normalizado.
43. Se preservan nombres propios, importes, fechas, comercios y últimos cuatro dígitos.
44. Si la intención es ambigua, se conserva el texto original.
45. El fallback ante un fallo de normalización es el texto original.
46. Los métodos de pago se normalizan determinísticamente, sin IA.
47. La comparación ignora mayúsculas, acentos y espacios sobrantes.
48. Se reconocen variantes implementadas de efectivo, débito, crédito, transferencia, tarjeta y cheque.
49. Ningún Worker implementa su propio corrector global.

## Instrumentos y responsable

50. El instrumento de pago es una entidad propia.
51. Su asociación principal es `workspaceId + type + last4`.
52. Una tarjeta conocida asigna automáticamente su titular como responsable.
53. Una tarjeta desconocida conserva los últimos cuatro dígitos y pregunta nombre y titular una sola vez.
54. La relación aprendida se reutiliza en usos futuros.
55. Sin últimos cuatro dígitos no se aprende por comercio.
56. No existe responsable global predeterminado por usuario.
57. No se infiere responsable por frecuencia.
58. No se crean reglas probabilísticas de titularidad.
59. Autorización, ticket, afiliación, terminal, caja, cajero y referencia bancaria no son últimos cuatro de tarjeta.

## Foto y PDF

60. Foto y PDF terminan en el mismo `ExpenseEvidenceInterpreted`.
61. Foto y PDF reutilizan Brain y `ExpenseAssistantWorker`.
62. La evidencia vive solo durante la petición.
63. No se guarda imagen, PDF, base64, archivo temporal, bucket o `storageKey`.
64. JPEG, PNG y WebP deben coincidir con su firma binaria.
65. El límite de archivo es 10 MB.
66. Un PDF representa un solo comprobante.
67. Solo se acepta PDF de una página.
68. PDF con texto seleccionable se interpreta desde el texto extraído.
69. PDF escaneado se renderiza en memoria a PNG y reutiliza el flujo de fotografía.
70. Un PDF con texto suficiente no se convierte a imagen.
71. PDF multipágina devuelve el mensaje de versión no soportada.
72. Estados de cuenta, contratos, cotizaciones y documentos no financieros no son comprobantes válidos.

## CFDI

73. En CFDI, el emisor es el comercio.
74. El receptor nunca es el comercio.
75. Las etiquetas se buscan en todo el documento; el orden visual no es requisito.
76. `FECHA DE EMISIÓN` es la fecha del gasto.
77. `TOTAL` es el importe; subtotal no lo sustituye.
78. PUE es método/modalidad de pago y no forma de pago.
79. Forma de pago 03 se interpreta como transferencia electrónica.
80. `SERIE + espacio + FOLIO` forma el número de documento.
81. Número de pedido no sustituye el folio de factura.
82. El RFC del emisor puede extraerse como `merchantRfc` sin confundirlo con el receptor.

## Duplicados e idempotencia

83. Se calcula SHA-256 sobre los bytes originales de imágenes y PDFs.
84. La huella es única dentro del Workspace.
85. La misma carga binaria no vuelve a llamar a OpenAI.
86. La misma carga binaria no crea otro `Expense` ni otro evento de creación.
87. Una fotografía diferente del mismo comprobante queda fuera de la detección v1.0.
88. Los mensajes de texto no usan huella binaria.
89. El `sourceEventId` se conserva durante toda la conversación para impedir duplicados.

## Conversación

90. La sesión se persiste en PostgreSQL y sobrevive reinicios.
91. Solo existe una sesión activa por Workspace, canal, conversación y usuario.
92. La sesión conserva todos los datos conocidos y el campo pendiente.
93. Una sesión activa tiene prioridad antes de abrir un gasto nuevo.
94. Una captura se elimina/cierra cuando el gasto se registra o el usuario cancela explícitamente.
95. `cancelar`, `olvídalo` y `salir` cierran la sesión sin borrar gastos confirmados.
96. Iniciar una intención prioritaria cierra la sesión incompatible anterior.
97. Responder a una sesión de evidencia no vuelve a llamar a OpenAI.

## Cancelación jerárquica

98. CANCELACIÓN se evalúa antes de gasto nuevo.
99. Una frase de cancelación nunca crea un `Expense`.
100. Un usuario normal no cancela directamente en una operación con varios usuarios.
101. Supervisor, Account Owner o Account Admin puede cancelar y debe indicar motivo.
102. Platform Admin no interviene en la operación normal.
103. Si existe un candidato único se solicita motivo.
104. Si no hay coincidencia clara o existen varias, se muestran hasta cinco gastos `REGISTERED`.
105. La lista prioriza el mismo chat, pero pertenece al mismo Workspace.
106. La sesión conserva los IDs exactos mostrados.
107. Una selección numérica solo puede elegir el ID asociado a ese número.
108. Una selección inválida permanece en CANCELACIÓN.
109. Nunca se cancela por una coincidencia ambigua.
110. El motivo es obligatorio antes de cambiar a `CANCELLED`.

## Arquitectura y seguridad

111. Brain orquesta y publica eventos resultantes.
112. Los Workers no conocen ni inyectan EventBus.
113. Los Workers se ejecutan secuencialmente en orden de registro.
114. Un fallo detiene la cadena y se propaga.
115. La autorización se valida en la API; no se confía en roles del frontend.
116. `workspaceId` mantiene aislamiento multi-tenant.
117. Las dependencias externas no viven en la lógica financiera.

