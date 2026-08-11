# Reglas de negocio — Auxiliar de Facturación v0.1

1. Una solicitud pertenece a un Workspace.
2. Puede originarse en un Expense o en una referencia de evidencia.
3. Un Expense relacionado debe pertenecer al mismo Workspace.
4. Los datos fiscales se referencian mediante `TaxProfile`; no se duplican.
5. Un `TaxProfile` utilizable debe pertenecer a la Account del Workspace y estar `ACTIVE`.
6. Una solicitud sin TaxProfile queda `NEEDS_TAX_DATA`.
7. Un TaxProfile proporcionado pero no aprobado se rechaza.
8. El comercio debe tener un `MerchantInvoiceProfile` activo.
9. Costco y Chedraui existen inicialmente como perfiles configurables.
10. No se presupone su estrategia final ni su adapter.
11. Las solicitudes repetidas para el mismo origen, TaxProfile y comercio son idempotentes.
12. Las transiciones de estado están restringidas.
13. Todo intento tiene número consecutivo y adapterKey.
14. Todo inicio, éxito o fallo de intento queda auditado.
15. Un éxito puede obtener XML, PDF o ambos.
16. `storageReference` es opaca y no define proveedor.
17. El checksum identifica el contenido obtenido sin guardar el archivo en la solicitud.
18. Los errores persistidos deben estar sanitizados.
19. No existe ejecución pública automática en v0.1.
20. Las lecturas siempre se limitan al Workspace autorizado.
