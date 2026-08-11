# Backlog — Auxiliar de Facturación

## Decisiones bloqueantes antes de Costco y Chedraui

1. Validar manualmente el proceso real y términos de uso de cada comercio.
2. Decidir por comercio entre plantilla estándar, adapter específico, correo, WhatsApp o proceso manual.
3. Completar `TaxProfile` con código postal, régimen fiscal, uso CFDI y correo, definiendo cuáles pertenecen al perfil y cuáles a la solicitud.
4. Elegir almacenamiento seguro para XML/PDF e implementar el resolver de `storageReference`.
5. Definir manejo seguro de credenciales de portales sin persistir secretos en configuración JSON.
6. Definir política de expiración, reintentos y límites por comercio.
7. Validar folios, fechas límite y campos requeridos reales de Costco y Chedraui.

## Fuera de v0.1

- Playwright, navegadores y automatización web.
- Acceso real a Costco o Chedraui.
- Integración con Brain o Telegram.
- Captura conversacional de datos fiscales.
- Almacenamiento definitivo y descarga real de documentos.
- Procesamiento masivo y múltiples comprobantes.
- Declaración de empleado listo o graduado.
