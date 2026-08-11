# Proceso de desarrollo de Employees

## Secuencia oficial

1. **Definir misión.** Precisar resultado empresarial, jefe y responsabilidad única.
2. **Definir alcance v1.0.** Enumerar entradas, salidas, límites y lo que queda fuera.
3. **Identificar dependencias reutilizables.** Revisar Brain, Workers, sesiones, Evidence, auditoría, permisos y adaptadores.
4. **Implementar una historia pequeña.** Cambiar únicamente lo necesario para un criterio verificable.
5. **Ejecutar pruebas técnicas.** Unitarias, integración, typecheck, lint y build según riesgo.
6. **Ejecutar prueba real.** Validar el canal y proveedor reales cuando formen parte de la aceptación.
7. **Documentar decisiones.** Registrar motivo, alternativas, impacto y alcance.
8. **Clasificar pendientes por costo de oportunidad.** Distinguir bloqueantes de mejoras posteriores.
9. **Completar graduación.** Ejecutar la matriz definida sin sustituir resultados pendientes por simulaciones.
10. **Crear perfil final.** Consolidar misión, límites, dependencias, KPIs y estado.
11. **Congelar v1.0.** Evitar reabrirla por mejoras menores.
12. **Mover mejoras al backlog.** Asociarlas al Employee y a una versión futura.

## Reglas de ejecución

- No hacer cambios grandes sin validaciones intermedias.
- No abrir varios frentes a la vez.
- No mezclar corrección de bugs con funciones nuevas.
- Diagnosticar la causa raíz antes de aplicar un parche.
- Los bugs bloqueantes se atienden antes de avanzar.
- Si el costo de seguir afinando una función supera avanzar al siguiente Employee, cerrar la versión y mover la mejora al backlog.
- Mantener separados diagnóstico, implementación y validación real.

Antes de empezar consulte [Design Philosophy](./Design_Philosophy.md), [Architecture Standards](./Architecture_Standards.md), [Business Policies](./Business_Policies.md) y [Employee Builder Manual](./Employee_Builder_Manual.md).

