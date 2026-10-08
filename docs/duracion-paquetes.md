# Duración total del paquete

Diverty Amigo(a) incluye actividades de una hora, pero su duración total es de **2 horas**. La factura, cotización y contrato usan la duración etiquetada del paquete antes de un valor antiguo obtenido de la primera actividad. El detalle de las actividades y los importes se conservan.

La función `serviceDurationHours` también se usa al editar servicios y calcular la duración operativa cuando no hay un ajuste explícito del personal. Un producto por unidades no se convierte en horas; un servicio por horas conserva su cantidad, incluida media hora. Dos unidades de un paquete no duplican su duración.

Para corregir una factura ya enviada: actualizar la app, abrir la reserva existente, generar la factura nuevamente y descargar/compartir el nuevo PDF. No hace falta crear otra reserva ni cambiar el precio. La visualización no modifica registros en Firebase ni archivos enviados previamente.

La web guarda la misma duración total con la descripción completa. El código equivalente está en `Diverty-/assets/js/diverty-service-duration.mjs` y en la política central preparada, sin activar servicios de pago. Mantener las tres copias equivalentes al cambiar esta regla.

Las pruebas cubren registros antiguos con `duracionHoras: 1`, prioridad del total reservado sobre un catálogo actualizado, tarifas por hora/unidad y renderizado de los tres documentos con precio $95 y duración 2 Horas.
