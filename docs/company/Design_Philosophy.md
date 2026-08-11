# Filosofía de diseño de CFO IA

CFO IA no construye chatbots: construye **Employees IA** con una misión empresarial definida. Cada Employee tiene perfil, responsabilidades, límites, jefe directo, entradas, salidas y KPIs. Su implementación técnica es uno o más `Worker`; el lenguaje comercial y el técnico no se confunden.

## Principios

1. Brain orquesta; los Employees ejecutan mediante Workers especializados.
2. Cada Employee tiene una sola misión y no realiza el trabajo de otro.
3. La IA ayuda a interpretar y explicar; nunca inventa información.
4. Cuando falta información necesaria, el sistema pregunta solamente lo faltante.
5. Las políticas del negocio tienen prioridad sobre prompts y conveniencia técnica.
6. Las decisiones se evalúan por costo de oportunidad para el producto.
7. Un Employee se cierra cuando cumple su misión v1.0, no cuando es perfecto.
8. Las mejoras no críticas se documentan en el backlog de una versión posterior.

El método corporativo para aplicar estos principios está en [Development Process](./Development_Process.md). Las reglas de IA están en [AI Principles](./AI_Principles.md) y la separación técnica en [Architecture Standards](./Architecture_Standards.md).

## Criterio de producto

Primero se define misión y límites; después se agregan funciones. Se trabaja una historia pequeña a la vez, se valida en el sistema real y se gradúa el Employee antes de abrir otro frente. Una automatización no precede a un núcleo confiable.

