# Investigación funcional comparativa: Costco y Chedraui

Fecha de investigación: 2026-08-05  
Alcance: facturación de tickets y compras en línea en México.  
Estado: investigación funcional; no constituye una implementación ni confirma que los portales autoricen automatización.

## Criterio de evidencia

- **Confirmado**: publicado por el comercio o por el portal operativo enlazado para ese comercio.
- **Observado en ticket**: instrucción impresa en un comprobante real usado durante las pruebas de CFO IA.
- **Pendiente de validación controlada**: el dato no está publicado de forma inequívoca o solo aparece después de capturar un ticket válido. No debe codificarse como regla definitiva.

No se enviaron tickets, RFC ni datos fiscales durante esta investigación. No se intentó resolver códigos de seguridad ni CAPTCHA.

## Resumen comparativo

| Tema | Costco | Chedraui |
|---|---|---|
| URL de facturación de ticket | [www3.costco.com.mx/facturacion](https://www3.costco.com.mx/facturacion) — URL impresa en tickets reales; el portal público no expuso su formulario durante esta revisión | [www.masfacturaweb.com.mx/chedraui](https://www.masfacturaweb.com.mx/chedraui/) — portal operativo; su [manual de facturación de ticket](https://www.masfacturaweb.com.mx/chedraui/Manual/ManualTicket.pdf) describe el flujo |
| Compra en línea | Se solicita factura durante checkout; Costco la emite y la envía al embarcar, por cada unidad adquirida | Los datos de facturación se entregan durante el pedido. Un pedido puede originar tickets y facturas independientes por paquete |
| Login | Ticket de tienda: pendiente de validación. Compra en línea: sí, requiere cuenta/membresía registrada | Portal de ticket: el manual no indica login. Compra en línea: forma parte de la cuenta/pedido |
| CAPTCHA | No confirmado públicamente | El manual exige un “Código de seguridad”; debe tratarse como intervención humana hasta verificar su naturaleza técnica |
| XML | Pendiente de validación para el flujo Costco | Sí, descargable desde “Consultar CFDI” |
| PDF | Pendiente de validación para el flujo Costco | Sí, se abre o guarda al emitir; también se descarga desde “Consultar CFDI” |
| Correo | Compra en línea: sí, al momento del embarque. Ticket de tienda: pendiente | Sí, si se proporciona correo; la consulta permite reenviar XML y PDF |
| Plazo de facturación | Ticket real observado: instruye facturar el mismo día de la compra. Debe confirmarse como política vigente antes de automatizar. Compra en línea: emisión al embarque | No se encontró un plazo oficial inequívoco en el manual ni en los términos revisados. Debe confirmarse con el portal usando un ticket válido o con soporte oficial |

## Costco

### URLs y canales oficiales

- Ticket de sucursal: [https://www3.costco.com.mx/facturacion](https://www3.costco.com.mx/facturacion), URL impresa en tickets Costco procesados por CFO IA.
- Ayuda oficial para pedidos en línea: [¿Cómo puedo obtener una factura por un pedido de costco.com.mx?](https://atencionalsocio.costco.com.mx/app/answers/detail/a_id/135/).
- Ayuda oficial de checkout y RFC: [Pago con tarjeta de débito o crédito](https://atencionalsocio.costco.com.mx/app/answers/detail/a_id/246/).
- Cuenta de compras en línea: [Mi Cuenta](https://atencionalsocio.costco.com.mx/app/answers/detail/a_id/229/).

### Flujo de ticket de sucursal

1. El cliente conserva el ticket y entra a la URL de facturación impresa.
2. Identifica la compra con los datos que solicite el portal.
3. Proporciona o selecciona sus datos fiscales.
4. Revisa que compra y receptor fiscal sean correctos.
5. Solicita la emisión del CFDI.
6. Recupera los documentos o recibe la confirmación por el medio ofrecido por el portal.

Los pasos 2 a 6 son la secuencia funcional esperada, pero los nombres exactos de campos, sus formatos, las descargas disponibles y los mensajes de error permanecen **pendientes de una validación controlada con ticket vigente**. El formulario no fue visible públicamente durante esta investigación.

### Flujo de compra en costco.com.mx

1. El socio inicia sesión con una cuenta vinculada a una membresía vigente.
2. Durante el checkout llega a “Métodos de pago”.
3. Selecciona “Solicitar Factura”.
4. Captura el RFC, verifica los datos y continúa la compra.
5. Costco valida el RFC; un RFC inválido impide el envío de la factura.
6. La factura se emite y se envía por correo cuando se realiza el embarque.
7. Costco genera una factura por cada unidad adquirida, no necesariamente una sola factura por pedido.

### Campos obligatorios confirmados

#### Del ticket o de la compra

- Identificador de la compra requerido por el portal de sucursal: nombre y formato exactos pendientes.
- Para compra en línea, la orden y sus unidades ya están dentro de la cuenta de Costco.

#### Del TaxProfile

- RFC: confirmado expresamente por Costco.
- Correo: necesario para la entrega anunciada de la factura de compra en línea; puede provenir de la cuenta o del TaxProfile según la política futura del motor.
- Razón social, código postal fiscal, régimen fiscal y uso CFDI: necesarios para CFDI 4.0 en el modelo de CFO IA, pero su captura exacta en el portal Costco no quedó públicamente verificada.

### Validaciones confirmadas

- El RFC debe ser válido; Costco advierte que, si es inválido, no puede enviar la factura.
- En compras en línea, el usuario debe revisar sus datos antes de continuar.
- La cuenta de compra en línea depende de una membresía registrada y vigente.
- Una orden con varias unidades puede producir varias facturas.

### Errores posibles

#### Confirmados

- RFC inválido: factura no enviada.
- Pedido todavía no embarcado: la factura de compra en línea aún no se emite.

#### Pendientes de catálogo real

- Ticket no encontrado, ya facturado, fuera de vigencia o con datos inconsistentes.
- Datos fiscales incompatibles con CFDI 4.0.
- Fallo de timbrado, descarga o envío de correo.
- Código de seguridad o CAPTCHA.

Estos errores son escenarios que el motor debe poder representar, pero no deben asignarse a códigos Costco hasta observar respuestas reales del portal.

### Plazo

- Un ticket físico real observado durante las pruebas de CFO IA imprime “EMITA SU FACTURA EL MISMO DÍA DE LA COMPRA EN NUESTRO PORTAL”. Para v0.1 debe tratarse como una restricción de alto riesgo y solicitar la factura el mismo día.
- Costco no publica en las páginas de ayuda revisadas una ventana general distinta para tickets de sucursal.
- En compra en línea, la emisión ocurre al embarque; no depende de que el usuario regrese después al portal.

### Login, CAPTCHA y entrega

- Compra en línea: **sí requiere login**.
- Ticket de sucursal: login **no verificado**.
- CAPTCHA/código de seguridad: **no verificado**.
- XML de ticket: **no verificado**.
- PDF de ticket: **no verificado**.
- Correo para pedido en línea: **sí**.
- Correo para ticket de sucursal: **no verificado**.

## Chedraui

### URLs y canales

- Portal operativo de tickets: [https://www.masfacturaweb.com.mx/chedraui/](https://www.masfacturaweb.com.mx/chedraui/).
- Manual del portal: [Manual de Usuario MFW Facturación de Ticket](https://www.masfacturaweb.com.mx/chedraui/Manual/ManualTicket.pdf).
- Reglas oficiales de compra en línea: [Términos y condiciones de plataformas digitales Chedraui](https://www.chedraui.com.mx/terminos-y-condiciones/plataformas-digitales).
- Canales oficiales y soporte: [Centro de Ayuda Chedraui](https://ayuda.chedraui.com.mx/hc/es-419/articles/360048712793/).

El dominio MasFacturaWeb pertenece al operador del portal. Antes de automatizar debe confirmarse desde un enlace vigente de Chedraui o con soporte que continúa siendo el canal autorizado.

### Flujo de ticket de sucursal

1. Entrar al portal y elegir “Crear Factura”.
2. Capturar el RFC del cliente, los datos del ticket y el código de seguridad.
3. Pulsar “Continuar”.
4. Si el RFC ya existe, revisar la información fiscal recuperada; si no existe, capturar los datos fiscales.
5. Corregir, si procede, los campos fiscales y continuar.
6. Revisar el formulario con el detalle de la compra.
7. Pulsar “Generar Factura”.
8. El portal presenta el PDF con opciones para abrirlo o guardarlo.
9. El portal confirma la generación y el envío al correo, si se proporcionó uno.
10. El usuario puede continuar facturando o cerrar.

### Flujo de consulta y recuperación

1. Elegir “Consultar CFDI”.
2. Capturar RFC y fecha de generación del CFDI; el monto es opcional.
3. Consultar la lista de CFDI que coinciden.
4. Seleccionar un CFDI.
5. Descargar XML o PDF.
6. Opcionalmente capturar un correo y enviar ambos archivos.

### Flujo de compra en chedraui.com.mx

1. El usuario proporciona datos verdaderos y exactos de registro y facturación como parte de su pedido.
2. Chedraui confirma y surte el pedido desde una sucursal.
3. El costo de envío puede aparecer en el ticket principal o en un ticket separado.
4. Cuando los artículos se entregan en paquetes diferentes, pueden generarse tickets y facturas independientes por paquete.
5. Los servicios prestados por terceros se facturan conforme al proceso indicado por ese tercero, no necesariamente mediante Chedraui.

### Campos obligatorios confirmados

#### Del ticket

- “Datos de Ticket”: el manual confirma el grupo, pero no enumera públicamente todos sus campos ni formatos.
- Código de seguridad.
- Para consultar un CFDI ya emitido: fecha de generación; monto opcional.

#### Del TaxProfile

- RFC.
- Información fiscal del receptor; si el RFC no está registrado, debe capturarse.
- Correo: opcional para el envío según el manual.
- El manual no enumera los nombres exactos de todos los campos fiscales; razón social, código postal fiscal, régimen fiscal y uso CFDI deben validarse en una prueba controlada de CFDI 4.0.

### Validaciones confirmadas

- RFC, datos del ticket y código de seguridad se validan antes de mostrar los datos fiscales.
- Si el RFC no existe en el portal, deben capturarse sus datos fiscales.
- El usuario puede sobrescribir información fiscal mostrada antes de continuar.
- Antes de emitir, el portal muestra el detalle de la compra.
- Para consultar CFDI, RFC y fecha de generación son obligatorios; el monto es opcional.
- Chedraui exige que la información de registro y facturación sea verdadera y exacta.

### Errores posibles

#### Confirmados por el flujo

- No encontrar CFDI con los criterios de consulta.
- Fallo o inconsistencia en RFC, datos del ticket o código de seguridad antes de continuar.
- RFC no registrado: requiere captura fiscal; no es por sí mismo un fallo definitivo.
- Incidencia del portal: existe un formulario de contacto que solicita tipo, causa y datos variables, y permite adjuntar evidencia.

#### Pendientes de catálogo real

- Ticket ya facturado, fuera de plazo o todavía no disponible.
- Datos fiscales rechazados por CFDI 4.0.
- Error de timbrado, correo o descarga.
- Límites de intentos y bloqueo temporal.

### Plazo

El manual operativo y los términos oficiales revisados **no publican un plazo inequívoco** para facturar tickets. Hay guías de terceros que mencionan plazos distintos, por lo que ninguno se adopta como regla. Debe confirmarse directamente en el portal con un ticket vigente o mediante soporte oficial antes de implementar.

### Login, CAPTCHA y entrega

- Login para facturar ticket: el manual **no lo requiere ni lo menciona**.
- Código de seguridad: **sí**; podría ser CAPTCHA, pero debe verificarse sin intentar evadirlo.
- PDF: **sí**, apertura y descarga al generar, y descarga posterior.
- XML: **sí**, descarga posterior desde “Consultar CFDI”.
- Correo: **sí**, si se proporcionó; la consulta permite enviar XML y PDF.

## Datos de ticket y datos fiscales

| Dato | Fuente normal | Costco | Chedraui |
|---|---|---|---|
| Comercio / merchantKey | Perfil del comercio y evidencia | `COSTCO` | `CHEDRAUI` |
| Identificador del ticket | Ticket | Formato exacto del portal pendiente | Grupo “Datos de Ticket”; campos exactos pendientes |
| Fecha y hora de compra | Ticket/Expense | Debe conservarse para vigencia y auditoría | Debe conservarse; no confundir con fecha de generación usada al consultar CFDI |
| Sucursal, caja, terminal | Ticket | Solo enviar si el portal lo exige | Solo enviar si el portal lo exige |
| Total | Ticket/Expense | Solo enviar si el portal lo exige | El monto es opcional en la consulta; requisito de emisión pendiente de verificar |
| Membresía / número de socio | Ticket o cuenta Costco | Puede ser exclusivo de Costco; requerimiento del portal pendiente | No aplica según la evidencia revisada |
| RFC | TaxProfile aprobado | Obligatorio y validado | Obligatorio |
| Razón social | TaxProfile aprobado | Captura exacta pendiente | Parte de información fiscal; campo exacto pendiente |
| Código postal fiscal | TaxProfile aprobado | Captura exacta pendiente | Campo exacto pendiente |
| Régimen fiscal | TaxProfile aprobado | Captura exacta pendiente | Campo exacto pendiente |
| Uso CFDI | TaxProfile aprobado | Captura exacta pendiente | Campo exacto pendiente |
| Correo | TaxProfile/cuenta autorizada | Entrega de compra en línea | Opcional para envío y reenvío |

El motor nunca debe tomar RFC, razón social, régimen, código postal o uso CFDI del OCR del ticket. Esos datos deben proceder de un TaxProfile aprobado.

## Pasos comunes

1. Identificar el comercio y el canal de compra.
2. Verificar que exista un TaxProfile aprobado.
3. Extraer y validar los identificadores del ticket sin alterar el Expense.
4. Validar la vigencia antes de iniciar.
5. Presentar o capturar datos fiscales desde el TaxProfile.
6. Revisar el detalle de compra antes de emitir.
7. Solicitar la generación del CFDI.
8. Normalizar éxito, error y referencia externa.
9. Obtener XML/PDF cuando el canal lo permita.
10. Registrar intento, documentos, checksum y AuditEvent.
11. Evitar una segunda emisión de la misma solicitud.

## Pasos exclusivos

### Costco

- Distinguir ticket de sucursal de pedido en línea.
- En compra en línea, usar cuenta/membresía y solicitar factura durante checkout.
- Esperar el embarque para considerar emitida la factura.
- Admitir una factura por cada unidad de una orden.
- Tratar el aviso de “mismo día” del ticket físico como restricción conservadora hasta confirmación oficial.
- Validar si el número de membresía participa en el formulario de ticket.

### Chedraui

- Usar el portal MasFacturaWeb y su código de seguridad.
- Recuperar o capturar datos fiscales dependiendo de si el RFC ya está registrado.
- Consultar CFDI por RFC y fecha de generación, con monto opcional.
- Descargar XML y PDF desde una lista de CFDI.
- Reenviar XML/PDF por correo.
- Manejar tickets y facturas independientes por paquete en pedidos en línea.
- Derivar al proceso del tercero cuando el cargo corresponde a un servicio externo.

## Distribución propuesta de responsabilidades

### Motor común

Debe pertenecer al Motor todo lo que conserva la misma semántica entre comercios:

- ciclo de vida de `InvoiceRequest` y transiciones válidas;
- autorización por Workspace y TaxProfile aprobado;
- idempotencia de la solicitud;
- creación y numeración de `InvoiceRequestAttempt`;
- auditoría de inicio, éxito, fallo y cancelación;
- manejo seguro de errores y datos sensibles;
- validación genérica de campos requeridos;
- resolución de `MerchantInvoiceProfile`;
- selección de estrategia y adapter;
- normalización del resultado a XML, PDF, referencia externa o error;
- checksums y metadatos de `InvoiceDocument`;
- persistencia abstracta de `storageReference`;
- políticas de reintento futuras, sin asumir que todo error es reintentable;
- bloqueo de una segunda emisión cuando la solicitud ya terminó;
- intervención humana cuando exista CAPTCHA/código de seguridad o una validación no automatizable.

### Plantilla configurable

Debe pertenecer a una Plantilla lo que cambia por comercio pero puede expresarse como datos:

- `merchantKey`, nombre y canal oficial;
- tipo de estrategia;
- conjunto de campos de ticket requeridos y sus aliases;
- mapeo TaxProfile → campos del portal;
- formatos de RFC, fecha, monto, ticket, sucursal o membresía;
- política de vigencia confirmada y zona horaria;
- si requiere login, correo o código de seguridad;
- documentos esperados y método de entrega;
- reglas para uno o varios CFDI por pedido/paquete/unidad;
- códigos y textos de error observados, una vez verificados;
- datos que deben ser confirmados por el usuario antes de emitir.

La plantilla no debe contener selectores de navegador, credenciales, scripts ni lógica para evadir controles.

### Adapter específico

Debe pertenecer a un Adapter solo lo inevitablemente técnico y exclusivo del portal:

- establecimiento y conservación de sesión del portal;
- navegación y secuencia concreta de pantallas;
- autenticación cuando exista;
- lectura de tokens dinámicos y controles antifalsificación;
- captura de campos y acciones específicas del portal;
- detección de código de seguridad/CAPTCHA y solicitud de intervención humana;
- interpretación de respuestas y mensajes propios del proveedor;
- recuperación controlada de XML/PDF y referencia externa;
- normalización de los errores técnicos a códigos del Motor;
- verificación posterior de que el CFDI realmente fue emitido.

Un CAPTCHA nunca debe ser resuelto o evitado de forma encubierta. Si el comercio no autoriza automatización o el portal la impide, la estrategia debe cambiar a `MANUAL`, `EMAIL` u otro canal permitido.

## Bloqueos antes de automatizar

1. Confirmar que las dos URLs operativas siguen siendo canales autorizados por cada comercio.
2. Ejecutar una prueba manual controlada con un ticket vigente de cada comercio y un TaxProfile de prueba autorizado.
3. Registrar nombres, formatos y obligatoriedad exacta de cada campo del ticket.
4. Confirmar el plazo vigente con evidencia oficial, especialmente Costco tienda y Chedraui.
5. Confirmar login, código de seguridad/CAPTCHA y límites de intentos.
6. Confirmar qué archivos entrega Costco para ticket de sucursal.
7. Confirmar los mensajes reales de ticket inválido, ya facturado, vencido y datos fiscales rechazados.
8. Revisar términos de uso, privacidad y autorización comercial antes de cualquier automatización.
9. Definir almacenamiento seguro definitivo para XML/PDF antes de marcar solicitudes como `COMPLETED`.

Hasta cerrar estos puntos no es responsable elegir `STANDARD_FORM` o `CUSTOM_ADAPTER` para Costco y Chedraui. Ambos perfiles deben permanecer configurables.

## Fuentes consultadas

- Costco Atención al Socio: [factura de pedido en línea](https://atencionalsocio.costco.com.mx/app/answers/detail/a_id/135/).
- Costco Atención al Socio: [pago y solicitud de factura](https://atencionalsocio.costco.com.mx/app/answers/detail/a_id/246/).
- Costco Atención al Socio: [Mi Cuenta](https://atencionalsocio.costco.com.mx/app/answers/detail/a_id/229/).
- Costco México: [membresías](https://www.costco.com.mx/membresias).
- Chedraui: [términos y condiciones de plataformas digitales](https://www.chedraui.com.mx/terminos-y-condiciones/plataformas-digitales).
- Chedraui: [canales digitales oficiales](https://ayuda.chedraui.com.mx/hc/es-419/articles/360048712793/).
- MasFacturaWeb/Chedraui: [manual operativo de facturación de ticket](https://www.masfacturaweb.com.mx/chedraui/Manual/ManualTicket.pdf).

