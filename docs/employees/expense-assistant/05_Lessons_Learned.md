# Lecciones aprendidas

1. Las pruebas reales de Telegram encontraron fallos que las unitarias no reprodujeron.
2. Un código con todas las pruebas verdes puede estar ejecutándose con un proceso antiguo.
3. Reiniciar API y long polling es parte de validar el comportamiento real.
4. Un `Buffer` puede satisfacer tipos TypeScript y aun ser rechazado en runtime por una librería que exige `Uint8Array` puro.
5. Los errores genéricos de transporte ocultan la etapa real; la observabilidad debe ser sanitizada pero suficiente.
6. No debe parchearse una frase cuando el problema es pérdida de intención o contexto.
7. La sesión debe pertenecer al núcleo, no al adaptador de Telegram.
8. Persistir el contexto evita perderlo tras reinicios.
9. Las intenciones prioritarias deben resolverse antes de intentar crear un gasto.
10. Una selección explícita es más segura que aumentar indefinidamente coincidencias difusas.
11. Los IDs mostrados deben persistirse para que una respuesta numérica sea determinística.
12. Los documentos fiscales requieren semántica de etiquetas, no dependencia del orden visual.
13. En CFDI, receptor y emisor son roles opuestos y no deben inferirse por posición.
14. Método de pago y forma de pago en CFDI no significan lo mismo.
15. El subtotal nunca debe competir con el total pagado.
16. Concepto y comercio cumplen funciones diferentes; duplicarlos empeora reportes.
17. Una autorización bancaria no es número de ticket ni últimos cuatro de tarjeta.
18. El aprendizaje debe ser explícito, determinístico y acotado.
19. No inferir por frecuencia evita reglas invisibles y difíciles de auditar.
20. La política del negocio tiene precedencia sobre la capacidad técnica de editar.
21. Cancelar y volver a registrar conserva mejor la historia que corregir en sitio.
22. Los cambios pequeños y verificables rompen menos flujos existentes.
23. Una historia pequeña por vez reduce regresiones.
24. Primero se define misión y límites; después se agregan funciones.
25. Cada empleado debe tener una sola responsabilidad.
26. Brain orquesta; los empleados ejecutan.
27. Los adaptadores transportan; no deciden negocio.
28. El costo de oportunidad decide prioridades del MVP.
29. No se debe reabrir un empleado por mejoras menores antes de graduarlo.
30. El backlog debe pertenecer al empleado y a una versión posterior.
31. Las automatizaciones no deben preceder a un núcleo confiable.
32. La ausencia de credenciales válidas debe reportarse, no simularse.
33. No afirmar integración aprobada si PostgreSQL rechazó las credenciales.
34. No afirmar una entrega real de Telegram sin `ok=true`.
35. No afirmar que un gasto se registró si quedó esperando un dato obligatorio.
36. La evidencia efímera reduce infraestructura, pero exige una huella persistente para duplicados.
37. La huella exacta no resuelve fotografías distintas del mismo documento; ese límite debe quedar explícito.
38. Los fakes protegen automatización, pero no sustituyen pruebas manuales del proveedor.
39. Los prompts deben expresar políticas documentales concretas y la salida debe validarse.
40. Las reglas determinísticas no deben consumir llamadas adicionales de IA.

