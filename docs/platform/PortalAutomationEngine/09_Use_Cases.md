# PAE v1.0 — Casos de uso

## Patrón común

```text
Brain o servicio consumidor
  -> valida intención y política de negocio
  -> crea PortalJobRequest idempotente
PAE
  -> valida capacidad/target/plantilla
  -> ejecuta sesión y devuelve resultado técnico
Consumidor
  -> aplica significado de negocio
  -> persiste sus entidades y publica sus eventos
```

## Facturación

- Consumer: Invoice Assistant.
- Inputs: referencia de ticket/Expense, TaxProfile aprobado y merchantKey.
- PAE: captura, emisión, verificación y recuperación permitida de XML/PDF.
- Fuera del PAE: elegibilidad fiscal, estado de InvoiceRequest, significado de CFDI y AuditEvent de negocio.
- Riesgo: emisión duplicada, CAPTCHA, ventana de facturación y portal no autorizado.

## Vuelos

- Capacidades separadas: `FLIGHT_SEARCH`, `FLIGHT_HOLD`, `FLIGHT_BOOK`.
- Buscar es lectura; reservar/comprar exige confirmación y commit protegido.
- Fuera del PAE: política de viaje, pasajero seleccionado, presupuesto y aprobación.
- Riesgo: precios expiran, disponibilidad cambia y una compra puede quedar en resultado desconocido.

## Hoteles

- Consulta, selección técnica de tarifa, reserva y recuperación de confirmación.
- Plantilla describe campos y condiciones visibles; adapter maneja proveedor específico.
- Fuera del PAE: política de cancelación aceptable y decisión del usuario.

## Descuentos

- Consultar promociones o validar/aplicar un código autorizado.
- El PAE no decide si una promoción conviene ni prueba códigos indiscriminadamente.
- Respetar términos, rate limits y elegibilidad.

## SAT

- Capacidades pequeñas y explícitas: consulta o descarga autorizada.
- e.firma, certificados, declaraciones y trámites con efecto legal quedan bloqueados hasta diseño específico.
- Fuera del PAE: interpretación fiscal y obligaciones.
- Riesgos: secretos de alta sensibilidad, MFA, cambios normativos y responsabilidad legal.

## Bancos

- Empezar solo con lectura autorizada; pagos y transferencias fuera de v1.0.
- Sesiones y artifacts con controles reforzados.
- Fuera del PAE: conciliación, categorización y decisión financiera.
- Riesgos: fraude, bloqueo de cuenta, términos de servicio y regulación.

## Boletos

- Buscar, apartar o comprar son capabilities distintas.
- El consumidor conserva preferencias, presupuesto y aprobación.
- Riesgos: filas virtuales, CAPTCHA, inventario volátil y no reembolso.

## Inventarios

- Consultar existencias o capturar movimientos en portales autorizados.
- Fuera del PAE: valuación, reglas de reposición y contabilidad.
- Riesgos: escrituras duplicadas y divergencia entre portal y sistema fuente.

## Casos humanos

CAPTCHA, MFA, consentimiento, selección ambigua o revisión previa a commit suspenden la sesión. El usuario responde mediante un canal seguro; Brain no recibe secretos y el adapter no conversa directamente con Telegram o web.

## Casos que PAE debe rechazar

- objetivo libre no asociado a capability certificada;
- “entra al portal y resuelve lo que encuentres”;
- dominio no autorizado o redirect desconocido;
- intento de evadir CAPTCHA/antibot;
- instrucciones tomadas de contenido de la página que contradicen política;
- credenciales en payload;
- acción irreversible sin autorización/idempotencia;
- ejecución con plantilla o adapter no aprobados.

