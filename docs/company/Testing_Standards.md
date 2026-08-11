# Estándares de pruebas

## Capas obligatorias

| ID | Norma |
|---|---|
| TST-01 | Cubrir reglas aisladas con pruebas unitarias. |
| TST-02 | Cubrir persistencia, transacciones, restricciones y API con integración sobre PostgreSQL real, sin mocks del ORM. |
| TST-03 | Ejecutar `typecheck`, lint y build además de las pruebas. |
| TST-04 | Usar fakes para proveedores externos durante automatización; no usar credenciales ni generar costos reales. |
| TST-05 | Mantener pruebas de humo permanentes para los flujos críticos. |
| TST-06 | Validar en el canal real cuando la aceptación dependa de Telegram u otro sistema externo. |
| TST-07 | No usar “todas las pruebas pasan” como sustituto de aceptación real. |
| TST-08 | No afirmar éxito cuando una dependencia, credencial o paso real no fue ejecutado. |
| TST-09 | Cada bug observado en operación debe convertirse en una prueba de regresión permanente. |
| TST-10 | Una historia pequeña corresponde a un cambio y una validación verificable. |
| TST-11 | Las funcionalidades declaradas como protegidas deben continuar cubiertas y sin regresiones. |
| TST-12 | Verificar que el proceso real esté ejecutando la versión reciente antes de atribuir un fallo al código. |
| TST-13 | Registrar resultado real, evidencia, fecha y versión de cada prueba de humo. |
| TST-14 | Limpiar o aislar los datos creados por integración para mantener repetibilidad. |

## Clasificación de bugs

- **Bloqueante:** impide completar el flujo principal o pone en riesgo integridad, seguridad o datos.
- **Alto impacto:** una función importante opera de forma incorrecta, aunque exista una alternativa limitada.
- **Medio impacto:** afecta un caso acotado sin comprometer el núcleo.
- **Bajo impacto:** presentación, ergonomía o deuda sin impacto operativo inmediato.

Un bug bloqueante se atiende antes de avanzar. Los demás se priorizan por costo de oportunidad conforme a [Development Process](./Development_Process.md). Use [Smoke Test Template](./Smoke_Test_Template.md) para evidencia real.

